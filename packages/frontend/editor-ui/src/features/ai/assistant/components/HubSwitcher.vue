<script lang="ts" setup>
import { useI18n } from '@n8n/i18n';
import { computed } from 'vue';

import { N8nRadioButtons, N8nTooltip } from '@n8n/design-system';
import type { ChatPanelMode } from '../chatPanelState.store';

type Props = {
	isBuildMode: boolean;
	disabled?: boolean;
	activeMode?: ChatPanelMode;
};

const props = withDefaults(defineProps<Props>(), {
	disabled: false,
	activeMode: undefined,
});

const emit = defineEmits<{
	toggle: [value: boolean];
	'switch-mode': [value: ChatPanelMode];
}>();

const i18n = useI18n();

const isNeroMode = computed(() => props.activeMode === 'nero');

const options = computed(() => [
	{ label: i18n.baseText('aiAssistant.tabs.ask'), value: false },
	{ label: i18n.baseText('aiAssistant.tabs.build'), value: true },
]);

function toggle(value: boolean) {
	emit('toggle', value);
}

function switchToNero() {
	emit('switch-mode', 'nero');
}

function switchFromNero() {
	emit('switch-mode', 'builder');
}
</script>

<template>
	<div :class="$style.switcher">
		<N8nTooltip
			v-if="!isNeroMode"
			:content="i18n.baseText('aiAssistant.tabs.builder.disabled.tooltip')"
			:disabled="!props.disabled"
		>
			<N8nRadioButtons
				size="small"
				:model-value="props.isBuildMode"
				:options="options"
				:disabled="props.disabled"
				@update:model-value="toggle"
			/>
		</N8nTooltip>
		<button
			v-if="isNeroMode"
			:class="[$style.neroBtn, $style.neroBtnActive]"
			data-test-id="nero-mode-active"
			@click="switchFromNero"
		>
			NERO
		</button>
		<button v-else :class="$style.neroBtn" data-test-id="nero-mode-switch" @click="switchToNero">
			NERO
		</button>
	</div>
</template>

<style lang="scss" module>
.switcher {
	display: flex;
	align-items: center;
	gap: var(--spacing--3xs);
}

.neroBtn {
	padding: var(--spacing--4xs) var(--spacing--2xs);
	border: 1px solid var(--color--foreground);
	border-radius: var(--radius);
	background: transparent;
	color: var(--color--text--tint-1);
	font-size: var(--font-size--2xs);
	font-weight: var(--font-weight--bold);
	cursor: pointer;
	transition: all 0.15s ease;
	font-family: var(--font-family);

	&:hover {
		border-color: var(--color--primary);
		color: var(--color--primary);
	}
}

.neroBtnActive {
	background: var(--color--primary);
	border-color: var(--color--primary);
	color: white;
}
</style>
