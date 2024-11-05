# vite-plugin-image-inline-optimizer

[![MIT License](http://img.shields.io/badge/license-MIT-blue.svg?style=flat)](LICENSE)

## Install

```shell
npm i -D vite-plugin-image-inline-optimizer # yarn add -D vite-plugin-image-inline-optimizer
```

## Usage

Add `viteImageInlineOptimizer` plugin to `vite.config.js` / `vite.config.ts`.

```js
// vite.config.js / vite.config.ts
import { viteImageInlineOptimizer } from 'vite-plugin-image-inline-optimizer'

export default {
  plugins: [
    viteImageInlineOptimizer({
      targets: [
        {
          searchPath: ['/src/assets','/src'], // path set for where to hunt for images (<img**>) referenced in the code
          inlineSize: 3072,                   // minimize size to bring the image inline
          resizeEnable: "2048x1440",           // will enable resizing, with the max size being 2048x1440, however:  will resize smaller to the width/height/css tags if available; if no max size limit simply set resizeEnable: true
          quality: 70,                        // compression level for jpg/png/webp images
        }
      ]
    })
  ]
}
```


