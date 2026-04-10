package crashlog

import (
	"fmt"
	"log/slog"
	"runtime/debug"
)

func Log(logger *slog.Logger, message string, recovered any, attrs ...any) {
	if logger == nil {
		logger = slog.Default()
	}

	fields := append([]any{}, attrs...)
	fields = append(fields,
		"panic", fmt.Sprint(recovered),
		"stack_trace", string(debug.Stack()),
	)

	logger.Error(message, fields...)
}
