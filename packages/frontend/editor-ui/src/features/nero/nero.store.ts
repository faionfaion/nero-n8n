import { ref, computed } from 'vue';
import { defineStore } from 'pinia';

export interface NeroMessage {
	id: string;
	role: 'user' | 'assistant' | 'system';
	content: string;
	timestamp: number;
	metadata?: Record<string, unknown>;
}

export const useNeroStore = defineStore('nero', () => {
	// Connection state
	const connected = ref(false);
	const connecting = ref(false);
	const sessionId = ref<string | null>(null);

	// Messages
	const messages = ref<NeroMessage[]>([]);
	const streamingContent = ref('');
	const isStreaming = ref(false);

	// Agent status
	const agentStatus = ref<'idle' | 'thinking' | 'tool_use' | 'streaming'>('idle');
	const currentTool = ref<string | null>(null);
	const currentActivity = ref<string | null>(null);

	// WebSocket
	let ws: WebSocket | null = null;
	let heartbeatTimer: ReturnType<typeof setInterval> | null = null;
	let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
	let reconnectDelay = 1000;

	// Nero channel-web config
	const neroBaseUrl = ref(window.location.origin.replace('n8n.', 'nero.'));
	const neroWsUrl = computed(
		() => neroBaseUrl.value.replace('https://', 'wss://').replace('http://', 'ws://') + '/ws',
	);

	function addMessage(msg: NeroMessage) {
		messages.value.push(msg);
	}

	function clearMessages() {
		messages.value = [];
	}

	async function connect() {
		if (connected.value || connecting.value) return;
		connecting.value = true;

		try {
			// Get WS token from nero-channel-web
			const tokenResp = await fetch(`${neroBaseUrl.value}/auth/ws-token`, {
				credentials: 'include',
			});
			if (!tokenResp.ok) {
				throw new Error(`Auth failed: ${tokenResp.status}`);
			}
			const { ws_token } = (await tokenResp.json()) as { ws_token: string };

			// Open WebSocket
			ws = new WebSocket(neroWsUrl.value);

			ws.onopen = () => {
				// First-message auth
				ws?.send(JSON.stringify({ type: 'auth', token: ws_token }));
			};

			ws.onmessage = (event) => {
				const msg = JSON.parse(event.data as string) as Record<string, unknown>;
				handleWSMessage(msg);
			};

			ws.onclose = (event) => {
				connected.value = false;
				connecting.value = false;
				stopHeartbeat();

				// Don't reconnect on auth failure
				if (event.code === 4001) return;

				// Exponential backoff reconnect
				reconnectTimer = setTimeout(() => {
					reconnectDelay = Math.min(reconnectDelay * 2, 30000);
					void connect();
				}, reconnectDelay);
			};

			ws.onerror = () => {
				connecting.value = false;
			};
		} catch {
			connecting.value = false;
		}
	}

	function disconnect() {
		if (reconnectTimer) {
			clearTimeout(reconnectTimer);
			reconnectTimer = null;
		}
		stopHeartbeat();
		if (ws) {
			ws.close(1000, 'User disconnect');
			ws = null;
		}
		connected.value = false;
		connecting.value = false;
		reconnectDelay = 1000;
	}

	function handleWSMessage(msg: Record<string, unknown>) {
		const type = msg.type as string;

		switch (type) {
			case 'auth_ok':
				connected.value = true;
				connecting.value = false;
				reconnectDelay = 1000;
				sessionId.value = (msg.session_id as string) || null;
				startHeartbeat();
				break;

			case 'ping':
				ws?.send(JSON.stringify({ type: 'pong' }));
				break;

			case 'message': {
				const data = msg.data as Record<string, unknown>;
				if (isStreaming.value) {
					// Finalize streaming message
					addMessage({
						id: (data.id as string) || crypto.randomUUID(),
						role: (data.role as 'assistant') || 'assistant',
						content: streamingContent.value || (data.content as string) || '',
						timestamp: (data.timestamp as number) || Date.now(),
						metadata: data.metadata as Record<string, unknown>,
					});
					streamingContent.value = '';
					isStreaming.value = false;
				} else {
					addMessage({
						id: (data.id as string) || crypto.randomUUID(),
						role: (data.role as 'assistant') || 'assistant',
						content: (data.content as string) || '',
						timestamp: (data.timestamp as number) || Date.now(),
						metadata: data.metadata as Record<string, unknown>,
					});
				}
				agentStatus.value = 'idle';
				currentTool.value = null;
				currentActivity.value = null;
				break;
			}

			case 'stream':
				if (!isStreaming.value) {
					isStreaming.value = true;
					agentStatus.value = 'streaming';
				}
				streamingContent.value += (msg.chunk as string) || '';
				break;

			case 'stream_end':
				// The final message will arrive as 'message' type
				break;

			case 'agent_status': {
				const statusData = msg.data as Record<string, unknown>;
				const status = statusData.status as string;
				if (status === 'running') {
					agentStatus.value = 'thinking';
				}
				currentTool.value = (statusData.tool as string) || null;
				currentActivity.value = (statusData.activity as string) || null;
				if (currentTool.value) {
					agentStatus.value = 'tool_use';
				}
				break;
			}

			case 'error':
				addMessage({
					id: crypto.randomUUID(),
					role: 'system',
					content: `Error: ${(msg.message as string) || 'Unknown error'}`,
					timestamp: Date.now(),
				});
				break;
		}
	}

	function sendMessage(content: string, metadata?: Record<string, unknown>) {
		if (!ws || !connected.value) return;

		const msg: NeroMessage = {
			id: crypto.randomUUID(),
			role: 'user',
			content,
			timestamp: Date.now(),
			metadata,
		};

		addMessage(msg);

		ws.send(
			JSON.stringify({
				type: 'message',
				content,
				metadata,
			}),
		);

		agentStatus.value = 'thinking';
	}

	function startHeartbeat() {
		stopHeartbeat();
		heartbeatTimer = setInterval(() => {
			if (ws?.readyState === WebSocket.OPEN) {
				ws.send(JSON.stringify({ type: 'pong' }));
			}
		}, 25000);
	}

	function stopHeartbeat() {
		if (heartbeatTimer) {
			clearInterval(heartbeatTimer);
			heartbeatTimer = null;
		}
	}

	return {
		// State
		connected,
		connecting,
		sessionId,
		messages,
		streamingContent,
		isStreaming,
		agentStatus,
		currentTool,
		currentActivity,
		neroBaseUrl,
		// Actions
		connect,
		disconnect,
		sendMessage,
		addMessage,
		clearMessages,
	};
});
