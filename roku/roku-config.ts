import { createRequire } from "node:module"
import { cpSync, existsSync, realpathSync } from "node:fs"
import { readFile } from "node:fs/promises"
import path from "node:path"
import type { Plugin } from "esbuild"
import { RokuConfig } from "@roku-sdk/rsg-ts/roku-config"

const here = import.meta.dirname
const bridge = path.join(here, "src/bridge")
// Babel and the Solid preset come from the SolidTV app, so its JSX compiles the way Vite compiles it.
const appRequire = createRequire(path.join(here, "../package.json"))
const babel = appRequire("@babel/core")
const solidPreset = appRequire("babel-preset-solid")
const { version } = appRequire("./package.json")
const hermesPlugins = [
    "@babel/plugin-transform-class-static-block",
    "@babel/plugin-transform-class-properties",
    "@babel/plugin-transform-classes",
    "@babel/plugin-transform-block-scoping"
].map(name => appRequire(name))
const rokuSolidDir = realpathSync(path.join(here, "node_modules/@roku-sdk/solid"))

const appSrc = path.resolve(here, "../src")
const ownPlatform = path.join(here, "src/platform")

const LEFT_OUT_LIBS: Record<string, string> = {
    "hls.js": path.join(here, "src/leftout/hls.js"),
    libpgs: path.join(here, "src/leftout/libpgs.js"),
    "libass-wasm": path.join(here, "src/leftout/libass.js")
}

const RENDERER_ALIASES: Record<string, string> = {
    "@solidtv/renderer": path.join(bridge, "renderer.js"),
    "@solidtv/renderer/webgl": path.join(bridge, "stubs.js"),
    "@solidtv/renderer/canvas": path.join(bridge, "stubs.js"),
    "@solidtv/renderer/webgl/shaders": path.join(bridge, "stubs.js")
}

// SolidTV's JSX targets @solidtv/solid, while the SDK compiles every JSX file for its own renderer.
// This compiles .jsx first, lowers it for Hermes the way the SDK lowers its own code, and keeps one
// copy of solid-js so both renderers share a reactive runtime.
const solidtv: Plugin = {
    name: "solidtv",
    setup(build) {
        build.onResolve({ filter: /^@solidtv\/renderer(\/webgl|\/canvas|\/webgl\/shaders)?$/ }, args => ({
            path: RENDERER_ALIASES[args.path]
        }))
        build.onResolve({ filter: /^@moonfin\/app\/src\// }, args =>
            build.resolve("./" + args.path.slice("@moonfin/app/src/".length), { kind: args.kind, resolveDir: appSrc })
        )
        // Every platform's module is Roku's own, so no webOS, Tizen, Vega or Xbox code comes along.
        build.onResolve({ filter: /^@moonfin\/platform-(webos|tizen|vega|xbox)\// }, args => {
            const name = args.path.replace(/^@moonfin\/platform-[a-z]+\//, "").replace(/\.js$/, "")
            const own = path.join(ownPlatform, name + ".js")
            if (existsSync(own)) return { path: own }
            return { errors: [{ text: `No Roku platform module for ${args.path}` }] }
        })
        // Left out of the Roku build: the browser playback libraries, and the readers, games and After
        // Hours, which open a stand-in screen.
        build.onResolve({ filter: /^(hls\.js|libpgs|libass-wasm)$/ }, args => ({ path: LEFT_OUT_LIBS[args.path] }))
        build.onResolve({ filter: /(Media\/(Books|Reader)|Games\/(Games|GameSystem|GameDetails|GamePlayer))\.jsx$|AfterHours\/trigger\.js$/ }, args =>
            args.importer.startsWith(appSrc) ? { path: path.join(here, "src/leftout/NotOnRoku.jsx") } : undefined
        )
        // The SDK resolves "main" only, and jszip's main is its Node build.
        build.onResolve({ filter: /^jszip$/ }, () => ({ path: path.resolve(here, "../node_modules/jszip/dist/jszip.min.js") }))
        build.onResolve({ filter: /^solid-js(\/.*)?$/ }, async args => {
            if (args.pluginData?.deduped) return undefined
            return build.resolve(args.path, { kind: args.kind, resolveDir: rokuSolidDir, pluginData: { deduped: true } })
        })
        // Hermes scopes let and const to the function, and the minifier reuses one short name across
        // sibling blocks, so a closure can end up holding another block's value. Every file outside the
        // SDK gets block scoping lowered to uniquely named vars before esbuild sees it. JSX compiles first.
        build.onLoad({ filter: /\.(jsx|m?js|cjs)$/ }, async args => {
            if (/[\\/]@roku-sdk[\\/+]/.test(args.path)) return undefined
            let code = await readFile(args.path, "utf8")
            const options = { filename: args.path, babelrc: false, configFile: false, sourceType: "unambiguous" as const }
            if (args.path.endsWith(".jsx")) {
                const jsx = await babel.transformAsync(code, {
                    ...options,
                    presets: [[solidPreset, { moduleName: "@solidtv/solid", generate: "universal", builtIns: [] }]],
                    sourceMaps: "inline"
                })
                code = jsx.code
            }
            const out = await babel.transformAsync(code, { ...options, plugins: hermesPlugins, sourceMaps: "inline", inputSourceMap: true })
            return { contents: out.code, loader: "js", resolveDir: path.dirname(args.path) }
        })
    }
}

// SolidTV's Roboto and pictures, copied from its public/ folder into the package before each build.
// Its other fonts, translations, the readers and the subtitle workers stay out.
const PUBLIC_ASSETS = [
    "fonts/Roboto-Regular.ttf",
    "fonts/Roboto-Medium.ttf",
    "fonts/Roboto-Bold.ttf",
    "icons",
    "images",
    "spinner",
    "loading",
    "seasonal",
    "party",
    "resources/logo-and-text.webp",
    "resources/banner-dark.webp"
]
const copyPublicAssets = () => {
    for (const asset of PUBLIC_ASSETS) {
        cpSync(path.resolve(here, "../public", asset), path.join(here, "pkg", asset), { recursive: true })
    }
}

const steps = { preBuild: copyPublicAssets, plugins: [{ plugin: solidtv, position: { before: "solid" as const } }] }

const configuration: RokuConfig = {
    app: {
        entryPoint: "src/index.ts",
        buildVariables: {
            "process.env.REACT_APP_PLATFORM": "roku",
            "process.env.REACT_APP_VERSION": version,
            "process.env.NODE_ENV": "production",
            "import.meta.env": {},
            __DEV__: false,
            __enableInspector__: false,
            __emitBoundsEvents__: false,
            __enableCompressedTextures__: false,
            __renderTextBatching__: false
        },
        logger: { baseLogLevel: "INFO", currentLogLevel: "INFO" },
        manifestEntries: {
            title: "Moonfin SolidTV",
            major_version: 0,
            minor_version: 0,
            build_version: 1,
            ui_resolutions: "fhd",
            uri_resolution_autosub: "*,sd,hd,fhd",
            mm_icon_focus_hd: "pkg:/images/app-icon-hd.png",
            mm_icon_focus_fhd: "pkg:/images/app-icon-fhd.png",
            splash_screen_hd: "pkg:/images/splash_hd.png",
            splash_color: "0x000000FF",
            splash_min_time: 1,
            rsg_version: "2.0"
        }
    },
    pipeline: { build: steps, startDev: steps }
}

export default configuration
