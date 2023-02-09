import { getInput, isDebug } from "@actions/core";
import { exec } from "@actions/exec";
import { context, getOctokit } from "@actions/github";
import hasPNPM from "has-pnpm";
import hasYarn from "has-yarn";
import { markdownTable } from "markdown-table";
import colors from "picocolors";
import { FileSize, getFilesFromGlobs, getFileSizes, humanizeBytes } from "tiny-file-size";

const COMMENT_HEADER = "## tiny-file-size report";

type PackageManager = "npm" | "yarn" | "pnpm";

const octokit = getOctokit(getInput("github_token", { required: true }));

export const logger = {
	info(message: string) {
		console.log(colors.blue(message));
	},
	warn(message: string) {
		console.log(colors.yellow(message));
	},
	error(message: string) {
		console.error(colors.red(message));
	},
	debug(message: string) {
		if (isDebug()) {
			console.log(colors.yellow(message));
		}
	},
};

function isString(value: unknown): value is string {
	return typeof value === "string";
}

function getPackageManager(): PackageManager {
	if (hasYarn()) {
		return "yarn";
	} else if (hasPNPM()) {
		return "pnpm";
	}
	return "npm";
}

async function findBotComment(owner: string, repo: string, pullRequestId: number) {
	const { data: comments } = await octokit.rest.issues.listComments({
		owner,
		repo,
		issue_number: pullRequestId,
	});

	logger.debug(`Fetched ${comments.length} comments`);

	const botComment = comments.find(comment =>
		// TOOD: in which order should these be checked?
		(comment.body || comment.body_text || "").startsWith(COMMENT_HEADER)
	);

	return botComment ?? null;
}

function getPullRequest() {
	const pullRequest = context.payload.pull_request;

	if (pullRequest === undefined) {
		throw new Error("No PR found. This action works only on pull requests.");
	}

	return pullRequest;
}

async function buildProject() {
	const pkgManager = getPackageManager();
	await exec(`${pkgManager} install`);
	await exec(`${pkgManager} run build`);
}

function buildTable(
	sizes: FileSize[],
	{ gzip, brotli }: { gzip: boolean; brotli: boolean }
): string {
	const rows: string[][] = [
		["File", "Size", gzip && "Gzip", brotli && "Brotli"].filter(isString),
	];

	for (const size of sizes) {
		const row: string[] = [];

		row.push(size.file, humanizeBytes(size.raw));

		if (gzip) {
			row.push(size.gzip !== null ? humanizeBytes(size.gzip) : "");
		}

		if (brotli) {
			row.push(size.brotli !== null ? humanizeBytes(size.brotli) : "");
		}

		rows.push(row);
	}

	return markdownTable(rows, { align: ["l", "r", "r", "r"] });
}

async function main() {
	const gzip = getInput("gzip") === "true";
	const brotli = getInput("brotli") === "true";
	const globs = getInput("globs", { required: true }).split(" ");
	const pullRequest = getPullRequest();

	logger.debug("ARGUMENTS " + JSON.stringify({ globs, gzip, brotli }));

	logger.info("Building current branch");
	await buildProject();
	logger.info("Collecting file sizes for current branch");
	const sizes = await getFileSizes({ files: getFilesFromGlobs(globs), gzip, brotli });
	logger.info(JSON.stringify(sizes, undefined, 4));

	try {
		logger.info(`Fetching branch ${pullRequest.base.ref}`);
		await exec(`git fetch origin ${pullRequest.base.ref} --depth=1`);
	} catch (error) {
		logger.error("Failed to fetch branch: " + (error as Error).message);
	}
	logger.info(`Checking out branch ${pullRequest.base.ref}`);
	await exec(`git checkout -f ${pullRequest.base.ref}`);

	logger.info("Building previous branch");
	await buildProject();
	logger.info("Collecting file sizes for previous branch");
	const prevSizes = await getFileSizes({ files: getFilesFromGlobs(globs), gzip, brotli });
	logger.info(JSON.stringify(prevSizes, undefined, 4));

	const body = [
		COMMENT_HEADER,
		"Current sizes:",
		buildTable(sizes, { gzip, brotli }),
		"Previous sizes:",
		buildTable(prevSizes, { gzip, brotli }),
	].join("\n\n");

	logger.info(
		`Fetching bot comment for PR ${pullRequest.number} at repo ${context.repo.owner}/${context.repo.repo}`
	);
	const comment = await findBotComment(context.repo.owner, context.repo.repo, pullRequest.number);

	if (comment) {
		logger.info("Updating bot comment");
		try {
			await octokit.rest.issues.updateComment({
				owner: context.repo.owner,
				repo: context.repo.repo,
				comment_id: comment.id,
				body,
			});
		} catch (e) {
			logger.error("Failed to update bot comment: " + (e as Error).message);
		}
	} else {
		logger.info("Creating bot comment");
		try {
			await octokit.rest.issues.createComment({
				owner: context.repo.owner,
				repo: context.repo.repo,
				issue_number: pullRequest.number,
				body,
			});
		} catch (e) {
			logger.error("Failed to create bot comment: " + (e as Error).message);
		}
	}
}

main();
