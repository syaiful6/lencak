build: build-ui bindata
	go build

build-ui:
	mkdir -p browser/dist/js \
		&& npm run build \
		&& mkdir -p assets/js && \
		cp browser/dist/js/index.js assets/js/ui.js

bindata: bindata-deps
	-rm assets/assets.go
	go-bindata -o assets/assets.go -pkg assets assets/...

bindata-deps:
	go get github.com/jteeuwen/go-bindata/...
