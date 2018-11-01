package resock

import (
	"net"
	"net/http"
	"net/url"

	"github.com/gorilla/websocket"
	log "github.com/sirupsen/logrus"
	redis "github.com/docker/go-redis-server"
)


type Server struct {
	rsv *redis.Server
	upgrader websocket.Upgrader
	messages       chan []byte
	connections    map[*connection]bool
	registerChan   chan *connection
	unregisterChan chan *connection
}

func NewServer(handler interface{}) (*Server, error) {
	rsv, err := redis.NewServer(redis.DefaultConfig().Handler(handler))
	if err != nil {
		return nil, err
	}
	return &Server{
		rsv: rsv,
		upgrader: websocket.Upgrader{CheckOrigin: upgradeCheckOrigin,},
		messages: make(chan []byte, 256),
		connections:    make(map[*connection]bool),
		registerChan:   make(chan *connection),
		unregisterChan: make(chan *connection),
	}, nil
}

func (srv *Server) Run() {
	for {
		select {
		case c := <-srv.registerChan:
			srv.connections[c] = true

		case c := <-srv.unregisterChan:
			srv.unregister(c)

		case m := <-srv.messages:
			for c := range srv.connections {
				select {
				case c.send <- m:
				default:
					srv.unregister(c)
				}
			}
		}
	}
}

func (srv *Server) unregister(c *connection) {
	if _, ok := srv.connections[c]; ok {
		close(c.send)
		delete(srv.connections, c)
	}
}

func upgradeCheckOrigin(r *http.Request) bool {
	origin := r.Header["Origin"]
	if len(origin) == 0 {
		return true
	}
	u, err := url.Parse(origin[0])
	if err != nil {
		return false
	}
	uh, _, err1 := net.SplitHostPort(u.Host)
	oh, _, err2 := net.SplitHostPort(r.Host)
	if err1 != nil || err2 != nil {
		return false
	}
	return EqualASCIIFold(uh, oh)
}

func (srv *Server) Serve(w http.ResponseWriter, r *http.Request) {
	ws, err := srv.upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Println(err)
		return
	}
	c := &connection{srv: srv, host: r.Host, ws: ws, send: make(chan []byte, 256)}
	srv.registerChan <- c
	go c.writeLoop()
	go c.readLoop()
}

func (srv *Server) Broadcast(data []byte) {
	srv.messages <- data
}
