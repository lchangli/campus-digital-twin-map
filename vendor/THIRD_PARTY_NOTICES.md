# 第三方运行依赖

本目录保存固定版本的浏览器运行文件，避免运行时依赖 CDN 重定向或自动更新。

| 组件 | 版本 | 原始发布包 | 许可文件 |
| --- | --- | --- | --- |
| 官方 CesiumJS（npm 包 `cesium`） | 1.145.0 | https://registry.npmjs.org/cesium/-/cesium-1.145.0.tgz | [Cesium 与第三方组件许可](cesium-1.145.0/LICENSE.md) |

下载时已按 npm registry 提供的 SHA-512 integrity 校验发布包，静态运行文件来自包内 `Build/Cesium/`，原样保存于 `cesium-1.145.0/`，未作修改。版本目录可避免浏览器复用旧运行库和 Workers 的缓存。

```text
包完整性：sha512-6Azix8b5LPpoVSx8XQ6zPztpluJVmq+CEO3W2rOWxtc6bri6Nc9MvCYhKmTW1LAEwfisV7yzNgfulCXw9842+g==
Cesium.js SHA-256：dbb7a1606ef2150c7266eee6eb10bfeba1bd1351cdce1df85787a45491f482e3
```

Cesium 1.145 许可原文来源：https://github.com/CesiumGS/cesium/blob/1.145/LICENSE.md

页面保留 CesiumJS 和底图服务的正常署名。项目的 MIT 许可证不替代本目录中第三方组件的原始许可证，也不适用于在线底图服务。
