package app

import (
	"fmt"
	"io"
	"io/ioutil"
	"os"
	"strings"

	log "github.com/sirupsen/logrus"
	"gopkg.in/yaml.v2"
)

// ConfigWorkspace is the config for a workspace
type ConfigWorkspace struct {
	Functions          map[string]*ConfigFunction     `yaml:"functions"`
	Environment        map[string]string              `yaml:"environment,omitempty"`
	Name               string                         `yaml:"name"`
	Tasks              []*ConfigTask                  `yaml:"tasks"`
	Columns            map[string]map[string][]string `yaml:"columns,omitempty"`
	InheritEnvironment bool                           `yaml:"inherit_environment,omitempty"`
}

// ConfigFunction is the config for a function
type ConfigFunction struct {
	Args     []string `yaml:"args,omitempty"`
	Command  string   `yaml:"commands"`
	Executor []string `yaml:"executor,omitempty"`
}

// ConfigTask is the config for a task
type ConfigTask struct {
	ID          int               `yaml:"id,omitempty"`
	Name        string            `yaml:"name"`
	Command     string            `yaml:"command"`
	KillSignal  KillSignal        `yaml:"killsignal"`
	Environment map[string]string `yaml:"environment,omitempty"`
	Service     bool              `yaml:"service,omitempty"`
	Executor    []string          `yaml:"executor,omitempty"`
	Stdout      string            `yaml:"stdout,omitempty"`
	Stderr      string            `yaml:"stderr,omitempty"`
	Metadata    map[string]string `yaml:"metada,omitempty"`
	Pwd         string            `yaml:"pwd,omitempty"`
}

type KillSignal string

// the loaded Workspaces configuration
type ConfigWorkspaces map[string]*ConfigWorkspace

// UnmarshalYAML implements the yaml.Umarshaler interface
// Unmarshals a string into a Loglevel, lowercasing the string and validating that it represents a
// valid loglevel
func (killsignal *KillSignal) UnmarshalYAML(unmarshal func(interface{}) error) error {
	var killsignalString string
	err := unmarshal(&killsignalString)
	if err != nil {
		return err
	}

	killsignalString = strings.ToLower(killsignalString)
	switch killsignalString {
	case "sigint", "sigterm", "sigkill":
	default:
		return fmt.Errorf("Invalid killsignal %s Must be one of [sigint, sigterm, sigkill]", killsignalString)
	}

	*killsignal = KillSignal(killsignalString)
	return nil
}

// parse config
func Parse(rd io.Reader) (*ConfigWorkspace, error) {
	in, err := ioutil.ReadAll(rd)
	if err != nil {
		return nil, err
	}

	var cfg *ConfigWorkspace
	err = yaml.Unmarshal(in, &cfg)
	if err != nil {
		return nil, err
	}

	return cfg, err
}

func ParseFile(path string) (*ConfigWorkspace, error) {
	fp, err := os.Open(path)
	if err != nil {
		return nil, err
	}

	defer fp.Close()

	config, err := Parse(fp)
	if err != nil {
		return nil, fmt.Errorf("error parsing %s: %v", path, err)
	}

	return config, nil
}

func LoadConfig(workspaces []string) (map[string]*ConfigWorkspace, error) {
	var configWorkspaces = make(map[string]*ConfigWorkspace)
	// Load workspaces
	for _, conf := range workspaces {
		log.Infof("Loading workspace file: %s", conf)
		cfg, err := ParseFile(conf)
		if err != nil {
			return nil, fmt.Errorf("error parsing %s: %v", conf, err)
		}
		if cfg != nil {
			configWorkspaces[cfg.Name] = cfg
		}
	}

	return configWorkspaces, nil
}
