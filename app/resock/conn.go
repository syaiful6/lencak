package resock

import (
	"time"

	"github.com/gorilla/websocket"
	log "github.com/sirupsen/logrus"
)

const (
	// Time allowed to write a message to the peer.
	writeWait = 10 * time.Second
	// Time allowed to read the next pong message from the peer.
	pongWait = 60 * time.Second
	// Send pings to peer with this period. Must be less than pongWait.
	pingPeriod = (pongWait * 9) / 10
)

type connection struct {
	srv  *Server
	host string
	ws   *websocket.Conn
	send chan []byte
}

func (c *connection) readLoop() {
	exit := make(chan bool)
	clientChan := make(chan struct{})
	defer func () {
		close(exit)
		close(clientChan)
		c.srv.unregisterChan <- c
		c.ws.Close()
	}()

	c.ws.SetReadDeadline(time.Now().Add(pongWait))
	c.ws.SetPongHandler(func(string) error {
		c.ws.SetReadDeadline(time.Now().Add(pongWait)); return nil
	})
	for {
		select {
		case <-exit:
			return
		default:
			_, reader, err := c.ws.NextReader();
			if err != nil {
				return
			}
			req, err := ParseRequest(&ReaderChanCloser{exit: exit, reader: reader,})
			if err != nil {
				log.Infof("websocker client error: %v", err)
				return
			}
			log.Infof("processing request %s", req.Name)
			req.Host = c.host
			req.ClientChan = clientChan
			reply, err := c.srv.rsv.Apply(req)

			if err != nil {
				log.Infof("processing request %s error: %v", req.Name, err)
				return
			}

			if _, err = reply.WriteTo(NewWriteChan(c.send)); err != nil {
				return
			}
		}
	}
}

func (c *connection) writeLoop() {
	ticker := time.NewTicker(pingPeriod)
	defer func() {
		ticker.Stop()
		c.ws.Close()
	}()
	for {
		select {
		case message, ok := <-c.send:
			if !ok {
				c.writeControl(websocket.CloseMessage)
				return
			}
			w, err := c.ws.NextWriter(websocket.TextMessage)
			if err != nil {
				return
			}
			w.Write(message)

			// Add queued chat messages to the current websocket message.
			n := len(c.send)
			for i := 0; i < n; i++ {
				w.Write(<-c.send)
			}

			if err := w.Close(); err != nil {
				return
			}
		case <-ticker.C:
			if err := c.writeControl(websocket.PingMessage); err != nil {
				return
			}
		}
	}
}

func (c *connection) writeControl(messageType int) error {
	c.ws.SetWriteDeadline(time.Now().Add(writeWait))
	return c.ws.WriteMessage(messageType, []byte{})
}
