import type { DomNode } from "@roku-sdk/interfaces"

export declare function start(mount: DomNode, tweens: DomNode, video: DomNode, close: () => void): void
export declare function pressKey(name: string, press: boolean, repeat?: boolean): void
export declare function setDeviceCaps(json: string): void
export declare function deepLink(params: { contentId?: string, mediaType?: string }): void
