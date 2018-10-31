package resock

import (
	"errors"
)

type ChannelWriter struct {
	writeChan chan []byte
}

func NewWriteChan(c chan []byte) {
	return &ChannelWriter{
		writeChan: c,
	}
}

// Writer implementation
func (ch *ChannelWriter) Write(p []byte) (int, error) {
	select {
	case ch.writeChan <- p:
		return len(p), nil
	default:
		return 0, errors.New("write channel blocked!")
	}
}
