// Package planner is Agile Frontier's pure Go+ scheduling engine.
package planner

import (
	"encoding/json"
	"fmt"
	"math"
	"sort"
	"strconv"
	"strings"
	"time"
)

type StoryState enum { Active(Name string); Done(); Canceled() }
type Urgency enum { StartNow(); WatchNext(); HasRoom() }
type PlanOutcome enum { Planned(Value Output); InvalidPlan(Message string) }

type WorkerCount refine(value int) { value > 0 && value <= 100 }
type PointsPerDay refine(value float64) { value > 0 && value <= 1000 }
type SprintDays refine(value int) { value > 0 && value <= 100 }

type Link struct {
	Type string `json:"type,omitempty"`
	Label string `json:"label,omitempty"`
	StoryID string `json:"storyId,omitempty"`
	Target string `json:"target,omitempty"`
	Key string `json:"key,omitempty"`
}

type Story struct {
	ID string `json:"id"`
	Key string `json:"key,omitempty"`
	Title string `json:"title"`
	Summary string `json:"summary,omitempty"`
	Points float64 `json:"points"`
	StoryPoints float64 `json:"storyPoints,omitempty"`
	Status string `json:"status"`
	Team string `json:"team,omitempty"`
	Assignee string `json:"assignee,omitempty"`
	Sprint string `json:"sprint,omitempty"`
	Labels []string `json:"labels,omitempty"`
	Links []Link `json:"links,omitempty"`
	DependsOn []string `json:"dependsOn,omitempty"`
	Dependencies []string `json:"dependencies,omitempty"`
}

type Options struct {
	Workers int `json:"workers"`
	PointsPerDay float64 `json:"pointsPerDay"`
	StartDate string `json:"startDate"`
	DeadlineDate string `json:"deadlineDate"`
	SprintDays int `json:"sprintDays"`
	FrontierDepth *int `json:"frontierDepth"`
	DependsOnLabel string `json:"dependsOnLabel"`
	DependedOnByLabel string `json:"dependedOnByLabel"`
}

type Request struct { Stories []Story `json:"stories"`; Options Options `json:"options"` }

type ScheduledStory struct {
	Story
	Start string `json:"start"`
	End string `json:"end"`
	StartDay float64 `json:"startDay"`
	EndDay float64 `json:"endDay"`
	DurationDays float64 `json:"durationDays"`
	Worker int `json:"worker"`
	WorkerName string `json:"workerName"`
	SprintNumber int `json:"sprintNumber"`
	CriticalDays float64 `json:"criticalDays"`
	Depth int `json:"depth"`
	Dependencies []string `json:"dependencies"`
	IsCritical bool `json:"isCritical"`
	LatestStart string `json:"latestStart"`
	LatestStartDay float64 `json:"latestStartDay"`
	SlackDays float64 `json:"slackDays"`
	Urgency string `json:"urgency"`
}

type Output struct {
	Scheduled []ScheduledStory `json:"scheduled"`
	Ignored []Story `json:"ignored"`
	Hidden []Story `json:"hidden"`
	Warnings []string `json:"warnings"`
	Cycles [][]string `json:"cycles"`
	TotalWorkDays float64 `json:"totalWorkDays"`
	CriticalPathDays float64 `json:"criticalPathDays"`
	FinishDate *string `json:"finishDate"`
	Utilization float64 `json:"utilization"`
}

type worker struct { id int; available float64 }

func ScheduleJSON(input string) string {
	var request Request
	if err := json.Unmarshal([]byte(input), &request); err != nil { return marshalError("decode request: " + err.Error()) }
	match Schedule(request.Stories, request.Options) {
	case Planned(value):
		body, err := json.Marshal(value)
		if err != nil { return marshalError(err.Error()) }
		return string(body)
	case InvalidPlan(message): return marshalError(message)
	}
}

func Schedule(stories []Story, options Options) PlanOutcome {
	if options.Workers < 1 || options.Workers > 100 { return InvalidPlan("workers must be between 1 and 100") }
	if options.PointsPerDay <= 0 || options.PointsPerDay > 1000 { return InvalidPlan("pointsPerDay must be positive") }
	if options.SprintDays < 1 || options.SprintDays > 100 { return InvalidPlan("sprintDays must be between 1 and 100") }
	if _, err := parseDate(options.StartDate); err != nil { return InvalidPlan("invalid startDate") }
	if _, err := parseDate(options.DeadlineDate); err != nil { return InvalidPlan("invalid deadlineDate") }

	stories = normalize(stories)
	byID := map[string]Story{}
	active := []Story{}
	ignored := []Story{}
	for _, story := range stories {
		byID[story.ID] = story
		match stateOf(story.Status) {
		case Active(_): active = append(active, story)
		case Done(): ignored = append(ignored, story)
		case Canceled(): ignored = append(ignored, story)
		}
	}
	activeIDs := map[string]bool{}
	for _, story := range active { activeIDs[story.ID] = true }
	dependencies, warnings := buildDependencies(stories, options)
	successors := map[string][]string{}
	for _, story := range active {
		filtered := []string{}
		for _, dep := range dependencies[story.ID] { if activeIDs[dep] { filtered = append(filtered, dep); successors[dep] = append(successors[dep], story.ID) } }
		dependencies[story.ID] = filtered
	}
	cycles := cyclesOf(active, successors)
	cyclic := map[string]bool{}
	for _, cycle := range cycles { for _, id := range cycle { cyclic[id] = true }; warnings = append(warnings, "dependency cycle: " + strings.Join(cycle, " -> ")) }

	duration := map[string]float64{}
	for _, story := range active { duration[story.ID] = math.Max(0.5, story.Points/options.PointsPerDay) }
	critical := map[string]float64{}
	var criticalOf func(string, map[string]bool) float64
	criticalOf = func(id string, visiting map[string]bool) float64 {
		if value, ok := critical[id]; ok { return value }
		if visiting[id] { return duration[id] }
		nextVisiting := cloneSet(visiting); nextVisiting[id] = true
		best := 0.0
		for _, next := range successors[id] { if !cyclic[next] { best = math.Max(best, criticalOf(next, nextVisiting)) } }
		critical[id] = duration[id] + best
		return critical[id]
	}
	for _, story := range active { criticalOf(story.ID, map[string]bool{}) }

	depth := map[string]int{}
	seenDepth := map[string]bool{}
	queue := []string{}
	for _, story := range active { if len(dependencies[story.ID]) == 0 { depth[story.ID] = 0; seenDepth[story.ID] = true; queue = append(queue, story.ID) } }
	for cursor := 0; cursor < len(queue); cursor++ {
		id := queue[cursor]
		for _, next := range successors[id] { candidate := depth[id]+1; if !seenDepth[next] || candidate < depth[next] { depth[next]=candidate; seenDepth[next]=true; queue=append(queue,next) } }
	}
	visible := map[string]bool{}
	hidden := []Story{}
	for _, story := range active {
		include := !cyclic[story.ID] && (options.FrontierDepth == nil || (seenDepth[story.ID] && depth[story.ID] <= *options.FrontierDepth))
		if include { visible[story.ID]=true } else { hidden=append(hidden,story) }
	}
	indegree := map[string]int{}
	ready := []string{}
	for id := range visible { for _, dep := range dependencies[id] { if visible[dep] { indegree[id]++ } }; if indegree[id]==0 { ready=append(ready,id) } }
	workers := []worker{}
	for i:=0;i<options.Workers;i++ { workers=append(workers,worker{id:i}) }
	finish := map[string]float64{}
	scheduled := []ScheduledStory{}
	maxCritical := 0.0
	for id := range visible { maxCritical=math.Max(maxCritical,critical[id]) }
	deadlineDay := workdaysBetween(options.StartDate,options.DeadlineDate)

	for len(ready)>0 {
		sort.Slice(ready,func(i,j int)bool { if critical[ready[i]]==critical[ready[j]] { return ready[i]<ready[j] }; return critical[ready[i]]>critical[ready[j]] })
		id:=ready[0]; ready=ready[1:]; story:=byID[id]
		dependencyFinish:=0.0
		for _,dep:=range dependencies[id] { if visible[dep] { dependencyFinish=math.Max(dependencyFinish,finish[dep]) } }
		chosen:=0; bestStart:=math.Max(workers[0].available,dependencyFinish); preferred:=preferredWorker(story.Assignee)
		for i:=1;i<len(workers);i++ { candidate:=math.Max(workers[i].available,dependencyFinish); if candidate<bestStart || (candidate==bestStart && workers[i].id==preferred) { chosen=i;bestStart=candidate } }
		startDay:=bestStart; endDay:=startDay+duration[id]; workers[chosen].available=endDay; finish[id]=endDay
		latest:=deadlineDay-critical[id]; slack:=latest-startDay; urgency:=urgencyOf(slack,float64(options.SprintDays))
		workerName:=story.Assignee; if workerName=="" { workerName=fmt.Sprintf("Worker %d",workers[chosen].id+1) }
		scheduled=append(scheduled,ScheduledStory{Story:story,Start:workdayDate(options.StartDate,startDay),End:workdayDate(options.StartDate,endDay),StartDay:startDay,EndDay:endDay,DurationDays:duration[id],Worker:workers[chosen].id,WorkerName:workerName,SprintNumber:int(startDay)/options.SprintDays+1,CriticalDays:critical[id],Depth:depth[id],Dependencies:dependencies[id],IsCritical:math.Abs(critical[id]-maxCritical)<0.001,LatestStart:workdayDate(options.StartDate,latest),LatestStartDay:latest,SlackDays:slack,Urgency:urgencyName(urgency)})
		for _,next:=range successors[id] { if visible[next] { indegree[next]--;if indegree[next]==0 {ready=append(ready,next)} } }
	}
	sort.Slice(scheduled,func(i,j int)bool { if scheduled[i].StartDay==scheduled[j].StartDay { return scheduled[i].CriticalDays>scheduled[j].CriticalDays }; return scheduled[i].StartDay<scheduled[j].StartDay })
	total:=0.0;work:=0.0
	for _,story:=range scheduled {total=math.Max(total,story.EndDay);work+=story.DurationDays}
	var finishDate *string
	if len(scheduled)>0 { value:=workdayDate(options.StartDate,total);finishDate=&value }
	utilization:=0.0;if total>0 {utilization=work/(total*float64(options.Workers))}
	return Planned(Output{Scheduled:scheduled,Ignored:ignored,Hidden:hidden,Warnings:warnings,Cycles:cycles,TotalWorkDays:total,CriticalPathDays:maxCritical,FinishDate:finishDate,Utilization:utilization})
}

func normalize(stories []Story) []Story { out:=make([]Story,0,len(stories));for i,story:=range stories {if story.ID==""{story.ID=story.Key};if story.ID==""{story.ID=fmt.Sprintf("STORY-%d",i+1)};if story.Title==""{story.Title=story.Summary};if story.Title==""{story.Title=story.ID};if story.Points==0&&story.StoryPoints>0{story.Points=story.StoryPoints};if story.Points<0{story.Points=1};if story.Status==""{story.Status="To Do"};if story.DependsOn==nil{story.DependsOn=[]string{}};story.DependsOn=append(story.DependsOn,story.Dependencies...);out=append(out,story)};return out }
func stateOf(status string) StoryState { switch strings.ToLower(strings.TrimSpace(status)) {case "done":return Done{};case "canceled","cancelled":return Canceled{};default:return Active{Name:status}} }
func urgencyOf(slack,sprint float64) Urgency {if slack<=1{return StartNow{}};if slack<=sprint/2{return WatchNext{}};return HasRoom{}}
func urgencyName(value Urgency)string{match value{case StartNow():return "red";case WatchNext():return "yellow";case HasRoom():return "green"}}
func canonical(value string)string{return strings.ToLower(strings.TrimSpace(value))}
func target(link Link)string{if link.StoryID!=""{return link.StoryID};if link.Target!=""{return link.Target};return link.Key}
func buildDependencies(stories []Story,options Options)(map[string][]string,[]string){ids:=map[string]bool{};deps:=map[string][]string{};for _,s:=range stories{ids[s.ID]=true;deps[s.ID]=append([]string{},s.DependsOn...)};for _,s:=range stories{for _,link:=range s.Links{relation:=canonical(link.Type);if relation==""{relation=canonical(link.Label)};to:=target(link);if relation==canonical(options.DependsOnLabel){deps[s.ID]=appendUnique(deps[s.ID],to)};if relation==canonical(options.DependedOnByLabel){deps[to]=appendUnique(deps[to],s.ID)}}};warnings:=[]string{};for id,values:=range deps{kept:=[]string{};for _,dep:=range values{if !ids[dep]{warnings=append(warnings,fmt.Sprintf("%s references missing dependency %s",id,dep));continue};kept=appendUnique(kept,dep)};deps[id]=kept};return deps,warnings}
func appendUnique(values []string,value string)[]string{if value==""{return values};for _,existing:=range values{if existing==value{return values}};return append(values,value)}
func preferredWorker(name string)int{parts:=strings.Fields(name);if len(parts)==0{return -1};value,err:=strconv.Atoi(parts[len(parts)-1]);if err!=nil{return -1};return value-1}
func cyclesOf(stories []Story,successors map[string][]string)[][]string{color:=map[string]int{};stack:=[]string{};cycles:=[][]string{};var visit func(string);visit=func(id string){color[id]=1;stack=append(stack,id);for _,next:=range successors[id]{if color[next]==0{visit(next)}else if color[next]==1{start:=0;for stack[start]!=next{start++};cycle:=append([]string{},stack[start:]...);cycles=append(cycles,cycle)}};stack=stack[:len(stack)-1];color[id]=2};for _,story:=range stories{if color[story.ID]==0{visit(story.ID)}};return cycles}
func cloneSet(source map[string]bool)map[string]bool{out:=map[string]bool{};for key,value:=range source{out[key]=value};return out}
func parseDate(value string)(time.Time,error){return time.Parse("2006-01-02",value)}
func workdayDate(start string,offset float64)string{date,_:=parseDate(start);for date.Weekday()==time.Saturday||date.Weekday()==time.Sunday{date=date.AddDate(0,0,1)};whole:=int(math.Floor(offset));fraction:=offset-float64(whole);direction:=1;if whole<0{direction=-1};for whole!=0{date=date.AddDate(0,0,direction);if date.Weekday()!=time.Saturday&&date.Weekday()!=time.Sunday{whole-=direction}};date=date.Add(time.Duration(fraction*24)*time.Hour);return date.UTC().Format(time.RFC3339)}
func workdaysBetween(start,end string)float64{from,_:=parseDate(start);to,_:=parseDate(end);direction:=1;if to.Before(from){direction=-1};days:=0.0;for (direction>0&&from.Before(to))||(direction<0&&from.After(to)){from=from.AddDate(0,0,direction);if from.Weekday()!=time.Saturday&&from.Weekday()!=time.Sunday{days+=float64(direction)}};return days}
func marshalError(message string)string{body,_:=json.Marshal(map[string]string{"error":message});return string(body)}
