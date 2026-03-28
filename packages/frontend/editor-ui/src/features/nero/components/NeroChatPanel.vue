<script setup lang="ts">
import { ref, computed, nextTick, onMounted, onBeforeUnmount, watch } from 'vue';
import { useNeroStore } from '../nero.store';
import { N8nButton, N8nIcon, N8nText } from '@n8n/design-system';

const emit = defineEmits<{
	close: [];
}>();

const neroStore = useNeroStore();
const inputText = ref('');
const messagesContainer = ref<HTMLDivElement | null>(null);
const inputRef = ref<HTMLTextAreaElement | null>(null);

const statusText = computed(() => {
	if (neroStore.connecting) return 'Connecting...';
	if (!neroStore.connected) return 'Disconnected';
	switch (neroStore.agentStatus) {
		case 'thinking':
			return 'Thinking...';
		case 'tool_use':
			return `Using: ${neroStore.currentTool || 'tool'}`;
		case 'streaming':
			return 'Responding...';
		default:
			return 'Connected';
	}
});

const statusColor = computed(() => {
	if (neroStore.connected) return 'var(--color--success)';
	if (neroStore.connecting) return 'var(--color--warning)';
	return 'var(--color--danger)';
});

function scrollToBottom() {
	void nextTick(() => {
		if (messagesContainer.value) {
			messagesContainer.value.scrollTop = messagesContainer.value.scrollHeight;
		}
	});
}

function handleSend() {
	const text = inputText.value.trim();
	if (!text || !neroStore.connected) return;
	neroStore.sendMessage(text);
	inputText.value = '';
	scrollToBottom();
}

function handleKeydown(event: KeyboardEvent) {
	if (event.key === 'Enter' && !event.shiftKey) {
		event.preventDefault();
		handleSend();
	}
}

function focusInput() {
	inputRef.value?.focus();
}

function handleConnect() {
	void neroStore.connect();
}

watch(
	() => neroStore.messages.length,
	() => {
		scrollToBottom();
	},
);

watch(
	() => neroStore.streamingContent,
	() => {
		scrollToBottom();
	},
);

onMounted(() => {
	if (!neroStore.connected && !neroStore.connecting) {
		void neroStore.connect();
	}
});

onBeforeUnmount(() => {
	// Don't disconnect on unmount — keep connection alive
});

defineExpose({ focusInput });
</script>

<template>
	<div :class="$style.container" data-test-id="nero-chat-panel">
		<!-- Header -->
		<div :class="$style.header">
			<slot name="header" />
			<div :class="$style.headerContent">
				<div :class="$style.headerTitle">
					<span :class="$style.statusDot" :style="{ backgroundColor: statusColor }" />
					<N8nText :bold="true" size="medium">NERO</N8nText>
					<N8nText size="small" color="text-light">{{ statusText }}</N8nText>
				</div>
				<N8nButton
					type="tertiary"
					size="mini"
					icon="circle-x"
					data-test-id="nero-chat-close"
					@click="emit('close')"
				/>
			</div>
		</div>

		<!-- Messages -->
		<div ref="messagesContainer" :class="$style.messages">
			<div
				v-if="neroStore.messages.length === 0 && !neroStore.connected"
				:class="$style.emptyState"
			>
				<N8nText size="medium" color="text-light"> Connect to NERO to start chatting </N8nText>
				<N8nButton
					type="secondary"
					size="small"
					:loading="neroStore.connecting"
					data-test-id="nero-connect-button"
					@click="handleConnect"
				>
					Connect
				</N8nButton>
			</div>

			<div v-else-if="neroStore.messages.length === 0" :class="$style.emptyState">
				<N8nText size="medium" color="text-light">
					Ask NERO to modify workflows, add nodes, or manage pipelines.
				</N8nText>
			</div>

			<div
				v-for="msg in neroStore.messages"
				:key="msg.id"
				:class="[
					$style.message,
					msg.role === 'user' ? $style.userMessage : $style.assistantMessage,
				]"
			>
				<div :class="$style.messageHeader">
					<N8nText :bold="true" size="small">
						{{ msg.role === 'user' ? 'You' : msg.role === 'system' ? 'System' : 'NERO' }}
					</N8nText>
				</div>
				<div :class="$style.messageContent">
					<N8nText size="small">{{ msg.content }}</N8nText>
				</div>
			</div>

			<!-- Streaming indicator -->
			<div v-if="neroStore.isStreaming" :class="[$style.message, $style.assistantMessage]">
				<div :class="$style.messageHeader">
					<N8nText :bold="true" size="small">NERO</N8nText>
				</div>
				<div :class="$style.messageContent">
					<N8nText size="small">{{ neroStore.streamingContent }}</N8nText>
					<span :class="$style.cursor">|</span>
				</div>
			</div>

			<!-- Agent status -->
			<div v-if="neroStore.agentStatus === 'tool_use'" :class="$style.agentStatus">
				<N8nIcon icon="cog" :class="$style.spinIcon" size="small" />
				<N8nText size="small" color="text-light">
					{{ neroStore.currentActivity || `Using ${neroStore.currentTool}` }}
				</N8nText>
			</div>

			<div v-if="neroStore.agentStatus === 'thinking'" :class="$style.agentStatus">
				<N8nIcon icon="spinner" :class="$style.spinIcon" size="small" />
				<N8nText size="small" color="text-light">Thinking...</N8nText>
			</div>
		</div>

		<!-- Input -->
		<div :class="$style.inputArea">
			<textarea
				ref="inputRef"
				v-model="inputText"
				:class="$style.input"
				:disabled="!neroStore.connected"
				placeholder="Ask NERO..."
				rows="2"
				data-test-id="nero-chat-input"
				@keydown="handleKeydown"
			/>
			<N8nButton
				type="primary"
				size="small"
				icon="send"
				:disabled="!inputText.trim() || !neroStore.connected"
				data-test-id="nero-chat-send"
				@click="handleSend"
			/>
		</div>
	</div>
</template>

<style lang="scss" module>
.container {
	display: flex;
	flex-direction: column;
	height: 100%;
	background: var(--color--background);
	border-left: 1px solid var(--color--foreground);
}

.header {
	border-bottom: 1px solid var(--color--foreground);
	padding: var(--spacing--2xs) var(--spacing--xs);
}

.headerContent {
	display: flex;
	align-items: center;
	justify-content: space-between;
}

.headerTitle {
	display: flex;
	align-items: center;
	gap: var(--spacing--3xs);
}

.statusDot {
	width: 8px;
	height: 8px;
	border-radius: 50%;
	display: inline-block;
}

.messages {
	flex: 1;
	overflow-y: auto;
	padding: var(--spacing--xs);
	display: flex;
	flex-direction: column;
	gap: var(--spacing--2xs);
}

.emptyState {
	display: flex;
	flex-direction: column;
	align-items: center;
	justify-content: center;
	gap: var(--spacing--sm);
	height: 100%;
	text-align: center;
	padding: var(--spacing--xl);
}

.message {
	padding: var(--spacing--2xs) var(--spacing--xs);
	border-radius: var(--radius--lg);
	max-width: 90%;
}

.userMessage {
	align-self: flex-end;
	background: var(--color--primary--tint-3);
}

.assistantMessage {
	align-self: flex-start;
	background: var(--color--foreground--tint-2);
}

.messageHeader {
	margin-bottom: var(--spacing--4xs);
}

.messageContent {
	white-space: pre-wrap;
	word-break: break-word;
}

.cursor {
	animation: blink 1s step-end infinite;
}

@keyframes blink {
	50% {
		opacity: 0;
	}
}

.agentStatus {
	display: flex;
	align-items: center;
	gap: var(--spacing--3xs);
	padding: var(--spacing--4xs) var(--spacing--xs);
}

.spinIcon {
	animation: spin 1s linear infinite;
}

@keyframes spin {
	from {
		transform: rotate(0deg);
	}
	to {
		transform: rotate(360deg);
	}
}

.inputArea {
	display: flex;
	align-items: flex-end;
	gap: var(--spacing--3xs);
	padding: var(--spacing--2xs) var(--spacing--xs);
	border-top: 1px solid var(--color--foreground);
}

.input {
	flex: 1;
	resize: none;
	border: 1px solid var(--color--foreground);
	border-radius: var(--radius);
	padding: var(--spacing--3xs) var(--spacing--2xs);
	font-family: var(--font-family);
	font-size: var(--font-size--sm);
	background: var(--color--background);
	color: var(--color--text);
	outline: none;

	&:focus {
		border-color: var(--color--primary);
	}

	&:disabled {
		opacity: 0.5;
	}
}
</style>
