package planner

// Go's package loader must see generated-code dependencies before Go+
// generation. This zero-cost alias keeps the Participle module in go.mod while
// planner.gp remains the authored consumer.
import "goforge.dev/participle"

type ParsedAssignment = participle.Assignment
