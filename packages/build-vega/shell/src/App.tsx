// The React Native shell that hosts the Moonfin web app on Vega OS.
//
// The app itself is the Enact build under assets/, loaded into the Vega WebView.
// This shell only does what a page cant: it reports the device and its address,
// forwards app state and the keys the WebView swallows, reads the YouTube trailer
// manifests and the Plex answers the page isnt allowed to, sends the playback stop report once page
// scripts are frozen in the background, and exits the app.
import {WebView} from '@amazon-devices/webview';
import type {OnSslErrorCallback, SslErrorData, WebViewErrorEvent, WebViewMessageEvent} from '@amazon-devices/webview/dist/types/WebViewTypes';
import {useNetInfo} from '@amazon-devices/keplerscript-netmgr-lib';
import * as React from 'react';
import {useCallback, useEffect, useRef, useState} from 'react';
import {BackHandler, StyleSheet, View} from 'react-native';
import {
	HWEvent,
	useHideSplashScreenCallback,
	useKeplerAppStateManager,
	usePreventHideSplashScreen,
	useTVEventHandler
} from '@amazon-devices/react-native-kepler';
import {bootScript, parsePageMessage, toPageScript, ShellMessage} from './bridge';
import {BootData, collectBootData} from './bootData';
import {sendStopReport, setPlaybackSession} from './playbackSession';
import {readManifest} from './youtubeManifest';
import {httpRequest} from './httpRequest';

// The WebView handles the back key itself and passes no menu key to the page.
const FORWARDED_KEYS: Record<string, string> = {menu: 'Menu'};

export const App = () => {
	const webRef = useRef<React.ElementRef<typeof WebView>>(null);
	const [boot, setBoot] = useState<BootData | null>(null);
	const insecureHosts = useRef(new Set<string>());

	usePreventHideSplashScreen();
	const hideSplashScreen = useHideSplashScreenCallback();
	const appState = useKeplerAppStateManager();
	const netInfo = useNetInfo();

	const send = useCallback((message: ShellMessage) => {
		webRef.current?.injectJavaScript(toPageScript(message));
	}, []);

	useEffect(() => {
		collectBootData().then(setBoot);
	}, []);

	useEffect(() => {
		const change = appState.addEventListener('change', (state) => {
			if (state === 'background') sendStopReport();
			send({type: 'APP_STATE', payload: {state: String(state)}});
		});
		const display = appState.addEventListener('displayChange', (state) => {
			send({type: 'DISPLAY_CHANGED', payload: {connected: state === 'displayConnected'}});
		});
		return () => {
			change.remove();
			display.remove();
		};
	}, [appState, send]);

	useEffect(() => {
		if (!boot) return;
		const details = netInfo.details as {ipAddress?: string | null} | null;
		send({type: 'NETWORK', payload: {connected: netInfo.isConnected === true, ip: details?.ipAddress || null}});
	}, [boot, netInfo, send]);

	useTVEventHandler((event: HWEvent) => {
		const key = FORWARDED_KEYS[event.eventType];
		if (key) send({type: 'KEY', payload: {key, action: event.eventKeyAction === 1 ? 'up' : 'down'}});
	});

	const onMessage = useCallback((event: WebViewMessageEvent) => {
		const message = parsePageMessage(event.nativeEvent.data);
		if (!message) return;
		switch (message.type) {
			case 'EXIT_APP':
				BackHandler.exitApp();
				break;
			case 'LOG':
				console.log('[moonfin]', JSON.stringify(message.payload));
				break;
			case 'ALLOW_INSECURE_HOST':
				insecureHosts.current.add(message.payload.host);
				break;
			case 'PLAYBACK_SESSION':
				setPlaybackSession(message.payload);
				break;
			case 'READ_MANIFEST':
				readManifest(message.payload).then((answer) => send({type: 'MANIFEST', payload: answer}));
				break;
			case 'HTTP_REQUEST':
				httpRequest(message.payload).then((answer) => send({type: 'HTTP_RESPONSE', payload: answer}));
				break;
		}
	}, [send]);

	// Self signed servers are the user's call, made in the app's settings.
	const onSslError = useCallback((error: SslErrorData, callback: OnSslErrorCallback) => {
		const host = (error.url.match(/^https?:\/\/([^/?#]+)/i) || [])[1];
		if (host && insecureHosts.current.has(host)) callback.proceed();
		else callback.cancel();
	}, []);

	const onError = useCallback(({nativeEvent}: WebViewErrorEvent) => {
		console.error(`[moonfin] page error ${nativeEvent.code} at ${nativeEvent.url}: ${nativeEvent.description}`);
	}, []);

	if (!boot) return <View style={styles.container} />;

	return (
		<View style={styles.container}>
			<WebView
				ref={webRef}
				style={styles.webview}
				source={{uri: 'file:///pkg/assets/index.html'}}
				injectedJavaScriptBeforeContentLoaded={bootScript(boot)}
				hasTVPreferredFocus
				allowSystemKeyEvents
				allowsDefaultMediaControl
				domStorageEnabled
				javaScriptEnabled
				mediaPlaybackRequiresUserAction={false}
				onLoad={hideSplashScreen}
				onError={onError}
				onMessage={onMessage}
				onSslError={onSslError}
				onCloseWindow={BackHandler.exitApp}
			/>
		</View>
	);
};

const styles = StyleSheet.create({
	container: {flex: 1, backgroundColor: '#000000'},
	webview: {flex: 1, backgroundColor: '#000000'}
});
