import { defineRailway, github, postgres, preserve, project, service, volume } from 'railway/iac';

/**
 * Railway infrastructure for oc-food-recs, as code.
 * See https://docs.railway.com/infrastructure-as-code
 *
 * This replaces railway.toml, which Railway stops reading on 2026-12-01.
 *
 * `railway config apply` manages the whole project, so a resource that is
 * missing from this file is planned for deletion. Add new services and
 * databases here instead of in the dashboard. Variable values stay in Railway:
 * `preserve()` keeps whatever is set there.
 *
 * The SvelteKit app (adapter-node) builds with `npm run build` and starts with
 * `node build/index.js`. `preDeployCommand` runs `npm run db:migrate`, which
 * applies the Drizzle migrations before each deployment, so a new build never
 * starts against an older schema. The healthcheck at `/api/health` queries the
 * database and answers 503 when it is unreachable.
 *
 * No builder is set, matching railway.toml, so Railway's default builder
 * applies. railway.toml once pinned Nixpacks, which provisioned a Node version
 * too old for the app's dependencies; that pin was removed.
 *
 * Not declared in this file: the generated `*.up.railway.app` domain, which
 * `railway config pull` does not import. It stays as configured in Railway.
 */
export default defineRailway(() => {
	const Postgres = postgres('Postgres', { region: 'us-west2' });
	Postgres.networking = { privateNetworkEndpoint: 'postgres', tcpProxies: { '5432': {} } };

	const postgresVolume = volume('postgres-volume', {
		alerts: { usage: { '100': {}, '80': {}, '95': {} } },
		allowOnlineResize: true,
		region: 'us-west2',
		sizeMB: 5000
	});

	const ocFoodRecs = service('oc-food-recs', {
		source: github('knakamura13/oc-food-recs', { checkSuites: false }),
		build: {
			buildCommand: 'npm install && npm run build'
		},
		deploy: {
			preDeployCommand: ['npm run db:migrate'],
			startCommand: 'node build/index.js',
			healthcheckPath: '/api/health',
			restartPolicyType: 'ON_FAILURE'
		},
		replicas: { 'us-west2': 1 },
		env: {
			DATABASE_URL: preserve(),
			EVENTS_ENABLED: preserve()
		}
	});

	return project('oc-food-recs', {
		resources: [ocFoodRecs, Postgres, postgresVolume]
	});
});
