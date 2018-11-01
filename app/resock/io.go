package resock

import (
	"errors"
	"io"
)

type ReaderChanCloser struct {
	exit chan bool
	reader io.Reader
}

func (r *ReaderChanCloser) Read(p []byte) (n int, err error) {
	return r.reader.Read(p)
}

func (r *ReaderChanCloser) Close() error {
	r.exit <- true
	return nil
}

type ChannelWriter struct {
	writeChan chan<- []byte
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
