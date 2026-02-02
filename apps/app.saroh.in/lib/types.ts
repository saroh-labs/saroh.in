// import { DirectorySyncProviders } from "@boxyhq/saml-jackson";
export interface SimpleLinkProps {
	domain?: string;
	key: string;
	url: string;
}
export interface TagProps {
	id: string;
	name: string;
	color: TagColorProps;
}

export type TagColorProps =
	| "red"
	| "yellow"
	| "green"
	| "blue"
	| "purple"
	| "pink"
	| "brown";

export type PlanProps = "free" | "pro" | "enterprise";

export interface ProjectProps {
	id: string;
	name: string;
	slug: string;
	logo?: string;
	usage: number;
	usageLimit: number;
	plan: PlanProps;
	stripeId?: string;
	billingCycleStart?: number;
	createdAt?: Date;

	domains?: {
		slug: string;
	}[];
	users?: {
		role: "owner" | "member";
	}[];
}

export interface ProjectWithDomainProps extends ProjectProps {
	domains: DomainProps[];
	primaryDomain?: DomainProps;
}

export interface UserProps {
	id: string;
	name: string;
	email: string;
	image?: string;
	createdAt: Date;
	role: "owner" | "member";
	projects?: { projectId: string }[];
}

export type DomainVerificationStatusProps =
	| "Valid Configuration"
	| "Invalid Configuration"
	| "Pending Verification"
	| "Domain Not Found"
	| "Unknown Error";

export interface DomainProps {
	slug: string;
	verified: boolean;
	primary: boolean;
	target?: string;
	type: "redirect" | "rewrite";
}

export interface BitlyGroupProps {
	guid: string;
	bsds: string[]; // custom domains
	tags: string[];
}

export interface ShortioDomainProps {
	id: number;
	domain: string;
	links: number;
}

export interface SAMLProviderProps {
	name: string;
	logo: string;
	saml: "okta" | "azure" | "google";
	samlModalCopy: string;
	// scim: keyof typeof DirectorySyncProviders;
	scimModalCopy: {
		url: string;
		token: string;
	};
}

// From https://vercel.com/docs/rest-api/endpoints#get-a-project-domain
export interface DomainResponse {
	name: string;
	apexName: string;
	projectId: string;
	redirect?: string | null;
	redirectStatusCode?: (307 | 301 | 302 | 308) | null;
	gitBranch?: string | null;
	updatedAt?: number;
	createdAt?: number;
	/** `true` if the domain is verified for use with the project. If `false` it will not be used as an alias on this project until the challenge in `verification` is completed. */
	verified: boolean;
	/** A list of verification challenges, one of which must be completed to verify the domain for use on the project. After the challenge is complete `POST /projects/:idOrName/domains/:domain/verify` to verify the domain. Possible challenges: - If `verification.type = TXT` the `verification.domain` will be checked for a TXT record matching `verification.value`. */
	verification: {
		type: string;
		domain: string;
		value: string;
		reason: string;
	}[];
}

// From https://vercel.com/docs/rest-api/endpoints#get-a-domain-s-configuration
export interface DomainConfigResponse {
	/** How we see the domain's configuration. - `CNAME`: Domain has a CNAME pointing to Vercel. - `A`: Domain's A record is resolving to Vercel. - `http`: Domain is resolving to Vercel but may be behind a Proxy. - `null`: Domain is not resolving to Vercel. */
	configuredBy?: ("CNAME" | "A" | "http") | null;
	/** Which challenge types the domain can use for issuing certs. */
	acceptedChallenges?: ("dns-01" | "http-01")[];
	/** Whether or not the domain is configured AND we can automatically generate a TLS certificate. */
	misconfigured: boolean;
}

// From https://vercel.com/docs/rest-api/endpoints#verify-project-domain
export interface DomainVerificationResponse {
	name: string;
	apexName: string;
	projectId: string;
	redirect?: string | null;
	redirectStatusCode?: (307 | 301 | 302 | 308) | null;
	gitBranch?: string | null;
	updatedAt?: number;
	createdAt?: number;
	/** `true` if the domain is verified for use with the project. If `false` it will not be used as an alias on this project until the challenge in `verification` is completed. */
	verified: boolean;
	/** A list of verification challenges, one of which must be completed to verify the domain for use on the project. After the challenge is complete `POST /projects/:idOrName/domains/:domain/verify` to verify the domain. Possible challenges: - If `verification.type = TXT` the `verification.domain` will be checked for a TXT record matching `verification.value`. */
	verification?: {
		type: string;
		domain: string;
		value: string;
		reason: string;
	}[];
}
