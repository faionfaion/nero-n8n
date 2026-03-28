import type { IAuthenticateGeneric, ICredentialType, INodeProperties } from 'n8n-workflow';

export class NeroApi implements ICredentialType {
	name = 'neroApi';
	displayName = 'NERO API';
	documentationUrl = 'https://nero.faion.net';

	properties: INodeProperties[] = [
		{
			displayName: 'API Base URL',
			name: 'baseUrl',
			type: 'string',
			default: 'http://127.0.0.1:8100',
			description: 'Base URL for nero-channel-web API',
		},
		{
			displayName: 'API Key',
			name: 'apiKey',
			type: 'string',
			typeOptions: { password: true },
			default: '',
			description: 'JWT or API key for NERO authentication',
		},
		{
			displayName: 'Python Path',
			name: 'pythonPath',
			type: 'string',
			default: '/srv/nero/nero-core/.venv/bin/python3',
			description: 'Path to Python interpreter with nero-pipeline installed',
		},
	];

	authenticate: IAuthenticateGeneric = {
		type: 'generic',
		properties: {
			headers: {
				Authorization: '=Bearer {{$credentials.apiKey}}',
			},
		},
	};
}
