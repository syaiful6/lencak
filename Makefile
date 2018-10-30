build: build-ui bindata
	go build

start-dev: build-ui bindata
	go run -race main.go

build-ui:
	mkdir -p ui/dist/js \
		&& npm run build \
		&& mkdir -p assets/js && \
		cp ui/dist/js/index.js assets/js/ui.js

bindata: bindata-deps
	-rm assets/assets.go
	go-bindata -o assets/assets.go -pkg assets assets/...

bindata-deps:
	go get github.com/jteeuwen/go-bindata/...
