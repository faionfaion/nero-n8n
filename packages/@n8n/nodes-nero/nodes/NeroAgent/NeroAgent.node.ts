import { execFile } from 'node:child_process';
import { writeFile, unlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import type {
	IExecuteFunctions,
	INodeExecutionData,
	INodeType,
	INodeTypeDescription,
} from 'n8n-workflow';
import { NodeOperationError } from 'n8n-workflow';

export class NeroAgent implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'NERO Agent',
		name: 'neroAgent',
		icon: 'file:nero.svg',
		group: ['transform'],
		version: 1,
		subtitle: '={{$parameter["command"]}}',
		description: 'Call NERO pipeline tools via Python bridge',
		defaults: {
			name: 'NERO Agent',
		},
		inputs: ['main'],
		outputs: ['main'],
		credentials: [
			{
				name: 'neroApi',
				required: false,
			},
		],
		properties: [
			{
				displayName: 'Command',
				name: 'command',
				type: 'options',
				options: [
					{ name: 'Agent Query', value: 'agent' },
					{ name: 'Structured Query', value: 'structured_query' },
					{ name: 'Render Template', value: 'render_template' },
					{ name: 'Validate Schema', value: 'validate_schema' },
				],
				default: 'agent',
				description: 'NERO pipeline command to execute',
			},
			{
				displayName: 'Prompt',
				name: 'prompt',
				type: 'string',
				typeOptions: { rows: 6 },
				default: '',
				description: 'Prompt text or template content',
				displayOptions: {
					show: { command: ['agent', 'structured_query', 'render_template'] },
				},
			},
			{
				displayName: 'System Prompt',
				name: 'systemPrompt',
				type: 'string',
				typeOptions: { rows: 4 },
				default: '',
				description: 'System prompt for agent/structured query',
				displayOptions: {
					show: { command: ['agent', 'structured_query'] },
				},
			},
			{
				displayName: 'Model',
				name: 'model',
				type: 'options',
				options: [
					{ name: 'Sonnet', value: 'sonnet' },
					{ name: 'Opus', value: 'opus' },
					{ name: 'Haiku', value: 'haiku' },
				],
				default: 'sonnet',
				description: 'Claude model to use',
				displayOptions: {
					show: { command: ['agent', 'structured_query'] },
				},
			},
			{
				displayName: 'Output Schema',
				name: 'outputSchema',
				type: 'json',
				default: '{}',
				description: 'JSON Schema for structured output',
				displayOptions: {
					show: { command: ['structured_query', 'validate_schema'] },
				},
			},
			{
				displayName: 'Template Context',
				name: 'templateContext',
				type: 'json',
				default: '{}',
				description: 'Context variables for Jinja2 template rendering',
				displayOptions: {
					show: { command: ['render_template'] },
				},
			},
			{
				displayName: 'Data to Validate',
				name: 'validateData',
				type: 'json',
				default: '{}',
				description: 'JSON data to validate against schema',
				displayOptions: {
					show: { command: ['validate_schema'] },
				},
			},
			{
				displayName: 'Max Tokens',
				name: 'maxTokens',
				type: 'number',
				default: 4096,
				description: 'Maximum output tokens',
				displayOptions: {
					show: { command: ['agent', 'structured_query'] },
				},
			},
			{
				displayName: 'Timeout (seconds)',
				name: 'timeout',
				type: 'number',
				default: 120,
				description: 'Maximum execution time in seconds',
			},
		],
	};

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const items = this.getInputData();
		const returnData: INodeExecutionData[] = [];

		const credentials = await this.getCredentials('neroApi').catch(() => null);
		const pythonPath =
			(credentials?.pythonPath as string) || '/srv/nero/nero-core/.venv/bin/python3';

		for (let i = 0; i < items.length; i++) {
			const command = this.getNodeParameter('command', i) as string;
			const timeout = (this.getNodeParameter('timeout', i) as number) * 1000;

			const params: Record<string, unknown> = { command };

			if (command === 'agent' || command === 'structured_query') {
				params.prompt = this.getNodeParameter('prompt', i) as string;
				params.system_prompt = this.getNodeParameter('systemPrompt', i) as string;
				params.model = this.getNodeParameter('model', i) as string;
				params.max_tokens = this.getNodeParameter('maxTokens', i) as number;
				if (command === 'structured_query') {
					params.output_schema = JSON.parse(this.getNodeParameter('outputSchema', i) as string);
				}
			} else if (command === 'render_template') {
				params.template = this.getNodeParameter('prompt', i) as string;
				params.context = JSON.parse(this.getNodeParameter('templateContext', i) as string);
			} else if (command === 'validate_schema') {
				params.data = JSON.parse(this.getNodeParameter('validateData', i) as string);
				params.schema = JSON.parse(this.getNodeParameter('outputSchema', i) as string);
			}

			const result = await callPythonBridge(pythonPath, params, timeout);

			if (!result.success) {
				throw new NodeOperationError(
					this.getNode(),
					String(result.error || 'Python bridge execution failed'),
					{ itemIndex: i },
				);
			}

			returnData.push({
				json: result as Record<string, string | number | boolean | null | object>,
				pairedItem: { item: i },
			});
		}

		return [returnData];
	}
}

async function callPythonBridge(
	pythonPath: string,
	params: Record<string, unknown>,
	timeout: number,
): Promise<Record<string, unknown>> {
	const inputFile = join(tmpdir(), `nero-bridge-${randomUUID()}.json`);

	try {
		await writeFile(inputFile, JSON.stringify(params), 'utf-8');

		return await new Promise<Record<string, unknown>>((resolve, reject) => {
			execFile(
				pythonPath,
				['-m', 'nero_pipeline.n8n', '--input', inputFile],
				{
					timeout,
					env: {
						...process.env,
						PYTHONPATH:
							'/srv/nero/nero-core/src:/srv/nero/nero-pipeline/src:/srv/nero/nero-sdk/src',
					},
				},
				(error, stdout, stderr) => {
					if (error) {
						// Try to parse stderr as JSON error
						try {
							const errObj = JSON.parse(stderr) as Record<string, unknown>;
							resolve({ success: false, ...errObj });
						} catch {
							reject(new Error(stderr || error.message));
						}
						return;
					}

					try {
						const result = JSON.parse(stdout) as Record<string, unknown>;
						resolve(result);
					} catch {
						resolve({
							success: true,
							content: stdout.trim(),
						});
					}
				},
			);
		});
	} finally {
		await unlink(inputFile).catch(() => {});
	}
}
