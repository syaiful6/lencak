package main

import (
	"flag"
	"fmt"
	"os"

	log "github.com/sirupsen/logrus"

	"github.com/syaiful6/lencak/app"
	"github.com/syaiful6/lencak/assets"
)

func main() {
	global := "lencak.yml"
	flag.StringVar(&global, "global", global, "global environment configuration")

	addr := ":9056"
	flag.StringVar(&addr, "addr", addr, "Addr for app to listen")

	var workspaces []string
	flag.Var((*app.AppendSliceValue)(&workspaces), "workspace", "lencak workspace file (can be specified multiple times), defaults to './workspace.yml'")

	if len(workspaces) == 0 {
		workspaces = append(workspaces, "workspace.yml")
	}
	config, err := app.LoadConfig(global, workspaces)
	if err != nil {
		fmt.Fprintf(os.Stderr, "configuration error: %v\n", err)
		os.Exit(1)
	}

	appInstance := app.NewApp(config, assets.Asset)

	if err = appInstance.ListenAndServe(addr); err != nil {
		log.Fatalln(err)
	}
}
