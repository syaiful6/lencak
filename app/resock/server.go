package resock

import (
	"errors"
	"github.com/gorilla/websocket"
	redis "github.com/docker/go-redis-server"
)


type Server struct {
	rsv redis.Server
	upgrader websocket.Upgrader
	MonitorChans []chan string
	methods      map[string]redis.HandlerFn
	writeChan    chan []byte
}
