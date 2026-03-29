import { test, expect } from '@playwright/test';

const N8N_URL = process.env.N8N_URL || 'http://localhost:5678';
const N8N_EMAIL = process.env.N8N_EMAIL || 'nero@faion.net';
const N8N_PASSWORD = process.env.N8N_PASSWORD || 'dmMbdvXZrebFjhAYbFICcXlyHO83WPp';

test.describe('NERO n8n Integration', () => {
	test('n8n is accessible and serves custom build', async ({ request }) => {
		const resp = await request.get(`${N8N_URL}/`);
		expect(resp.ok()).toBeTruthy();
		const html = await resp.text();
		expect(html).toContain('<!DOCTYPE html>');
	});

	test('NERO code is present in JS bundle', async ({ request }) => {
		const indexResp = await request.get(`${N8N_URL}/`);
		const html = await indexResp.text();
		const jsMatch = html.match(/\/assets\/index-[a-zA-Z0-9]+\.js/);
		expect(jsMatch).toBeTruthy();

		const bundleResp = await request.get(`${N8N_URL}${jsMatch![0]}`);
		const bundle = await bundleResp.text();
		expect(bundle).toContain('nero-chat-panel');
		expect(bundle).toContain('nero-chat-input');
		expect(bundle).toContain('nero-connect-button');
	});

	test('n8n healthcheck passes', async ({ request }) => {
		const resp = await request.get(`${N8N_URL}/healthz`);
		expect(resp.ok()).toBeTruthy();
		const data = await resp.json();
		expect(data.status).toBe('ok');
	});

	test('n8n API: workflow CRUD', async ({ request }) => {
		const apiKey = process.env.N8N_API_KEY || '';
		const headers = { 'X-N8N-API-KEY': apiKey, 'Content-Type': 'application/json' };

		// Create
		const createResp = await request.post(`${N8N_URL}/api/v1/workflows`, {
			headers,
			data: {
				name: 'PW CRUD Test',
				nodes: [
					{
						id: 't1',
						name: 'Trigger',
						type: 'n8n-nodes-base.manualTrigger',
						typeVersion: 1,
						position: [250, 300],
						parameters: {},
					},
				],
				connections: {},
				settings: { executionOrder: 'v1' },
			},
		});
		expect(createResp.ok()).toBeTruthy();
		const { id: wfId } = await createResp.json();
		expect(wfId).toBeTruthy();

		// Read
		const getResp = await request.get(`${N8N_URL}/api/v1/workflows/${wfId}`, { headers });
		expect(getResp.ok()).toBeTruthy();
		const wf = await getResp.json();
		expect(wf.nodes).toHaveLength(1);

		// Update (add node + connection)
		const updateResp = await request.put(`${N8N_URL}/api/v1/workflows/${wfId}`, {
			headers,
			data: {
				name: 'PW CRUD Updated',
				nodes: [
					...wf.nodes,
					{
						id: 't2',
						name: 'Set',
						type: 'n8n-nodes-base.set',
						typeVersion: 3.4,
						position: [450, 300],
						parameters: {},
					},
				],
				connections: {
					Trigger: { main: [[{ node: 'Set', type: 'main', index: 0 }]] },
				},
				settings: wf.settings,
			},
		});
		expect(updateResp.ok()).toBeTruthy();

		// Verify
		const verifyResp = await request.get(`${N8N_URL}/api/v1/workflows/${wfId}`, { headers });
		const updated = await verifyResp.json();
		expect(updated.nodes).toHaveLength(2);
		expect(updated.connections).toHaveProperty('Trigger');

		// Delete
		const delResp = await request.delete(`${N8N_URL}/api/v1/workflows/${wfId}`, { headers });
		expect(delResp.ok()).toBeTruthy();
	});

	test('NERO Python tools: workflow + node CRUD', async ({}) => {
		const { execSync } = await import('node:child_process');
		const result = execSync(
			`N8N_API_KEY="${process.env.N8N_API_KEY}" PYTHONPATH=/srv/nero/nero-core/src python3 -c "
from nero_core.tools.n8n_tool import n8n_workflow_tool, n8n_node_tool
import json, os, httpx

r = n8n_workflow_tool(action='create', name='PW Tool Test', nodes=[{'id':'t1','name':'T','type':'n8n-nodes-base.manualTrigger','typeVersion':1,'position':[250,300],'parameters':{}}], connections={})
assert 'id' in r, f'Create: {r}'
wf = r['id']

r = n8n_node_tool(action='add_node', workflow_id=wf, node_type='n8n-nodes-base.set', node_name='A', connect_after='T')
assert 'added' in r, f'Add: {r}'

r = n8n_node_tool(action='update_node', workflow_id=wf, node_name='A', parameters={'mode':'manual'})
assert 'updated' in r, f'Update: {r}'

r = n8n_node_tool(action='connect', workflow_id=wf, from_node='A', to_node='T')
assert 'connected' in r, f'Connect: {r}'

r = n8n_node_tool(action='disconnect', workflow_id=wf, from_node='A', to_node='T')
assert 'disconnected' in r, f'Disconnect: {r}'

r = n8n_node_tool(action='remove_node', workflow_id=wf, node_name='A')
assert 'removed' in r, f'Remove: {r}'

httpx.delete(f'http://127.0.0.1:5678/api/v1/workflows/{wf}', headers={'X-N8N-API-KEY':os.environ['N8N_API_KEY']}, timeout=10)
print('ALL_OK')
"`,
			{ encoding: 'utf-8', timeout: 30000 },
		);
		expect(result.trim()).toContain('ALL_OK');
	});

	test('NERO Python bridge: Jinja2 template rendering', async ({}) => {
		const { execSync } = await import('node:child_process');
		const result = execSync(
			`python3 -c "
import json, tempfile, subprocess, os
d = {'command':'render_template','template':'Hello {{ name }}! Items: {{ items | length }}','context':{'name':'NERO','items':[1,2,3]}}
f = tempfile.NamedTemporaryFile(mode='w', suffix='.json', delete=False)
json.dump(d, f); f.close()
r = subprocess.run(['python3','-m','nero_pipeline.n8n','--input',f.name], capture_output=True, text=True, env={**os.environ,'PYTHONPATH':'/home/nero/workspace/nero-pipeline/src'})
os.unlink(f.name)
o = json.loads(r.stdout)
assert o['success'] and o['content'] == 'Hello NERO! Items: 3', o
print('BRIDGE_OK')
"`,
			{ encoding: 'utf-8', timeout: 15000 },
		);
		expect(result.trim()).toContain('BRIDGE_OK');
	});

	test('NERO Python bridge: JSON schema validation', async ({}) => {
		const { execSync } = await import('node:child_process');
		const result = execSync(
			`python3 -c "
import json, tempfile, subprocess, os
d = {'command':'validate_schema','data':{'name':'test','score':95},'schema':{'type':'object','properties':{'name':{'type':'string'},'score':{'type':'integer'}},'required':['name','score']}}
f = tempfile.NamedTemporaryFile(mode='w', suffix='.json', delete=False)
json.dump(d, f); f.close()
r = subprocess.run(['python3','-m','nero_pipeline.n8n','--input',f.name], capture_output=True, text=True, env={**os.environ,'PYTHONPATH':'/home/nero/workspace/nero-pipeline/src'})
os.unlink(f.name)
o = json.loads(r.stdout)
assert o['success'] and o['valid'], o
print('VALIDATE_OK')
"`,
			{ encoding: 'utf-8', timeout: 15000 },
		);
		expect(result.trim()).toContain('VALIDATE_OK');
	});

	test('UI: can login and access workflow editor', async ({ page }) => {
		// Login via API to get session cookie
		const loginResp = await page.request.post(`${N8N_URL}/rest/login`, {
			data: { emailOrLdapLoginId: N8N_EMAIL, password: N8N_PASSWORD },
		});
		expect(loginResp.ok()).toBeTruthy();

		// Navigate to workflows
		await page.goto(`${N8N_URL}/home/workflows`);
		await page.waitForLoadState('networkidle');

		// Page should load (not redirect to signin)
		const url = page.url();
		expect(url).not.toContain('/signin');
	});

	test('UI: NERO mode button present in JS bundle', async ({ request }) => {
		// Verify nero-mode-switch data-test-id is in the bundle
		const indexResp = await request.get(`${N8N_URL}/`);
		const html = await indexResp.text();
		const jsMatch = html.match(/\/assets\/index-[a-zA-Z0-9]+\.js/);
		expect(jsMatch).toBeTruthy();

		const bundleResp = await request.get(`${N8N_URL}${jsMatch![0]}`);
		const bundle = await bundleResp.text();
		expect(bundle).toContain('nero-mode-switch');
		expect(bundle).toContain('nero-mode-active');
		expect(bundle).toContain('switchToNero');
	});
});
