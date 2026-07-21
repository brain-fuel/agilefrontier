//go:build js && wasm

package main

import (
	"syscall/js"
	"goforge.dev/agilefrontier/planner"
)

func main() {
	api := map[string]any{
		"schedule": js.FuncOf(func(_ js.Value, args []js.Value) any {
			if len(args) == 0 { return `{"error":"missing request"}` }
			return planner.ScheduleJSON(args[0].String())
		}),
	}
	js.Global().Set("agilefrontier", js.ValueOf(api))
	if ready := js.Global().Get("__agilefrontierReady"); ready.Type() == js.TypeFunction { ready.Invoke() }
	select {}
}
