package planner

import (
	"encoding/json"
	"strings"
	"testing"
)

func TestApplyOptionAssignmentsConsumesParticiple(t *testing.T) {
	base := Options{Workers: 1, PointsPerDay: 1, SprintDays: 5}
	result := ApplyOptionAssignments("workers=6; pointsPerDay=3; sprintDays=12; frontierDepth=2", base)
	applied, ok := result.(OptionsApplied)
	if !ok {
		t.Fatalf("result=%T", result)
	}
	if applied.Value.Workers != 6 || applied.Value.PointsPerDay != 3 || applied.Value.SprintDays != 12 || applied.Value.FrontierDepth == nil || *applied.Value.FrontierDepth != 2 {
		t.Fatalf("options=%+v", applied.Value)
	}

	rejected, ok := ApplyOptionAssignments("workers=?", base).(InvalidOptionAssignments)
	if !ok || !strings.Contains(rejected.Message, "expected integer") {
		t.Fatalf("rejection=%#v", rejected)
	}
	unknown, ok := ApplyOptionAssignments("velocity=3", base).(InvalidOptionAssignments)
	if !ok || !strings.Contains(unknown.Message, "unknown planning option") {
		t.Fatalf("unknown=%#v", unknown)
	}
}

func plan(t *testing.T, stories []Story, configure func(*Options)) Output {
	t.Helper()
	depth := 9
	options := Options{Workers: 2, PointsPerDay: 2, StartDate: "2026-07-21", DeadlineDate: "2026-08-18", SprintDays: 10, FrontierDepth: &depth, DependsOnLabel: "depends on", DependedOnByLabel: "is depended on by"}
	if configure != nil {
		configure(&options)
	}
	outcome := Schedule(stories, options)
	value, ok := outcome.(Planned)
	if !ok {
		t.Fatalf("schedule = %#v", outcome)
	}
	return value.Value
}

func TestCriticalPathPriorityAndDependencies(t *testing.T) {
	result := plan(t, []Story{
		{ID: "A", Title: "Long root", Points: 4, Status: "To Do"},
		{ID: "B", Title: "Long successor", Points: 8, Status: "To Do", Links: []Link{{Type: "depends on", StoryID: "A"}}},
		{ID: "C", Title: "Short root", Points: 2, Status: "To Do"},
	}, nil)
	if len(result.Scheduled) != 3 {
		t.Fatalf("scheduled = %d", len(result.Scheduled))
	}
	if result.Scheduled[0].ID != "A" || result.Scheduled[0].CriticalDays != 6 {
		t.Fatalf("first = %#v", result.Scheduled[0])
	}
	var aEnd, bStart float64
	for _, story := range result.Scheduled {
		if story.ID == "A" {
			aEnd = story.EndDay
		}
		if story.ID == "B" {
			bStart = story.StartDay
		}
	}
	if bStart < aEnd {
		t.Fatalf("dependent story starts at %.1f before dependency ends at %.1f", bStart, aEnd)
	}
}

func TestReverseLinkAndClosedStories(t *testing.T) {
	result := plan(t, []Story{
		{ID: "DONE", Title: "Closed", Points: 2, Status: "Done"},
		{ID: "A", Title: "A", Points: 2, Status: "To Do", Links: []Link{{Type: "is depended on by", StoryID: "B"}}},
		{ID: "B", Title: "B", Points: 2, Status: "To Do"},
	}, nil)
	if len(result.Ignored) != 1 || len(result.Scheduled) != 2 {
		t.Fatalf("result = %#v", result)
	}
	if result.Scheduled[1].ID != "B" || result.Scheduled[1].StartDay < result.Scheduled[0].EndDay {
		t.Fatalf("reverse relation not honored: %#v", result.Scheduled)
	}
}

func TestFrontierDepthAndDeadlineUrgency(t *testing.T) {
	zero := 0
	result := plan(t, []Story{
		{ID: "A", Title: "A", Points: 4, Status: "To Do"},
		{ID: "B", Title: "B", Points: 4, Status: "To Do", DependsOn: []string{"A"}},
		{ID: "C", Title: "C", Points: 4, Status: "To Do", DependsOn: []string{"B"}},
	}, func(options *Options) { options.FrontierDepth = &zero; options.DeadlineDate = "2026-07-22" })
	if len(result.Scheduled) != 1 || len(result.Hidden) != 2 {
		t.Fatalf("frontier result = %#v", result)
	}
	if result.Scheduled[0].Urgency != "red" {
		t.Fatalf("urgency = %q", result.Scheduled[0].Urgency)
	}
}

func TestCyclesAreExhaustiveWarnings(t *testing.T) {
	result := plan(t, []Story{{ID: "A", Title: "A", Points: 1, Status: "To Do", DependsOn: []string{"B"}}, {ID: "B", Title: "B", Points: 1, Status: "To Do", DependsOn: []string{"A"}}}, nil)
	if len(result.Cycles) != 1 || len(result.Scheduled) != 0 || len(result.Hidden) != 2 {
		t.Fatalf("cycle result = %#v", result)
	}
}

func TestWasmWireContract(t *testing.T) {
	request := Request{Stories: []Story{{ID: "A", Title: "A", Points: 2, Status: "To Do"}}, Options: Options{Workers: 1, PointsPerDay: 2, StartDate: "2026-07-21", DeadlineDate: "2026-08-01", SprintDays: 10, DependsOnLabel: "depends on", DependedOnByLabel: "is depended on by"}}
	body, _ := json.Marshal(request)
	var decoded map[string]any
	if err := json.Unmarshal([]byte(ScheduleJSON(string(body))), &decoded); err != nil || decoded["scheduled"] == nil {
		t.Fatalf("wire output: %v %#v", err, decoded)
	}
}
