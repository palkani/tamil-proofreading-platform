package properties

import (
	"bufio"
	"os"
	"strings"
	"sync"
)

var (
	once   sync.Once
	loaded map[string]string
)

func load() {
	loaded = map[string]string{}

	// Look for an app.properties file in the current working directory.
	// - In CI: working-directory is backend/ so this resolves.
	// - In Docker runtime: we copy app.properties alongside the binary.
	f, err := os.Open("app.properties")
	if err != nil {
		return
	}
	defer f.Close()

	sc := bufio.NewScanner(f)
	for sc.Scan() {
		line := strings.TrimSpace(sc.Text())
		if line == "" {
			continue
		}
		if strings.HasPrefix(line, "#") || strings.HasPrefix(line, ";") {
			continue
		}
		// KEY=value (split on first '=')
		i := strings.IndexByte(line, '=')
		if i <= 0 {
			continue
		}
		key := strings.TrimSpace(line[:i])
		val := strings.TrimSpace(line[i+1:])
		if key == "" {
			continue
		}
		loaded[key] = val
	}
}

func Get(key string) (string, bool) {
	once.Do(load)
	v, ok := loaded[key]
	if !ok {
		return "", false
	}
	v = strings.TrimSpace(v)
	return v, v != ""
}


