function extractPRInfoFromLabeledPR(context) {
    const pr = context.payload.pull_request;
    return {
        prNumber: pr.number,
        prHead: pr.head.sha,
        branchName: pr.head.ref,
        hasDogfoodLabel: pr.labels.some(label => label.name === 'dogfood'),
        headSha: pr.head.sha
    };
}

async function extractPRInfoFromWorkflowRun(github, context) {
    const workflowRun = context.payload.workflow_run;
    const headSha = workflowRun.head_sha;
    let prNumber = null;
    if (workflowRun.event === 'pull_request') {
        const { data: prs } = await github.rest.pulls.list({
            owner: context.repo.owner,
            repo: context.repo.repo,
            state: 'open',
            head_sha: headSha
        });
        if (prs && prs.length > 0) {
            prNumber = prs[0].number;
        }
    }
    if (!prNumber) {
        const { data: associatedPRs } = await github.rest.repos.listPullRequestsAssociatedWithCommit({
            owner: context.repo.owner,
            repo: context.repo.repo,
            commit_sha: headSha
        });
        if (associatedPRs && associatedPRs.length > 0) {
            prNumber = associatedPRs[0].number;
        } else {
            return null;
        }
    }
    // Fetch full PR details
    const { data: pr } = await github.rest.pulls.get({
        owner: context.repo.owner,
        repo: context.repo.repo,
        pull_number: prNumber
    });
    return {
        prNumber,
        prHead: pr.head.sha,
        branchName: pr.head.ref,
        hasDogfoodLabel: pr.labels.some(label => label.name === 'dogfood'),
        headSha
    };
}

async function extractPRInfoFromCheckSuite(github, context) {
    const checkSuite = context.payload.check_suite;
    const headSha = checkSuite.head_sha;
    let prNumber = null;
    let prHead = null;
    let branchName = null;
    let hasDogfoodLabel = false;
    if (checkSuite.pull_requests && checkSuite.pull_requests.length > 0) {
        const pr = checkSuite.pull_requests[0];
        prNumber = pr.number;
        // Fetch full PR details for labels
        const { data: prFull } = await github.rest.pulls.get({
            owner: context.repo.owner,
            repo: context.repo.repo,
            pull_number: prNumber
        });
        hasDogfoodLabel = prFull.labels.some(label => label.name === 'dogfood');
        branchName = prFull.head.ref;
        prHead = prFull.head.sha;
    } else {
        const { data: associatedPRs } = await github.rest.repos.listPullRequestsAssociatedWithCommit({
            owner: context.repo.owner,
            repo: context.repo.repo,
            commit_sha: headSha
        });
        if (associatedPRs && associatedPRs.length > 0) {
            prNumber = associatedPRs[0].number;
            const { data: prFull } = await github.rest.pulls.get({
                owner: context.repo.owner,
                repo: context.repo.repo,
                pull_number: prNumber
            });
            hasDogfoodLabel = prFull.labels.some(label => label.name === 'dogfood');
            branchName = prFull.head.ref;
            prHead = prFull.head.sha;
        } else {
            return null;
        }
    }
    return {
        prNumber,
        prHead,
        branchName,
        hasDogfoodLabel,
        headSha
    };
}

async function createOrUpdateDogfoodBranch(github, core, prNumber, prHead, branchName) {
    const dogfoodBranchName = `dogfood/${branchName}`;
    try {
        await github.rest.git.getRef({
            owner: github.context.repo.owner,
            repo: github.context.repo.repo,
            ref: `heads/${dogfoodBranchName}`
        });
        await github.rest.git.updateRef({
            owner: github.context.repo.owner,
            repo: github.context.repo.repo,
            ref: `heads/${dogfoodBranchName}`,
            sha: prHead,
            force: true
        });
        console.log(`Updated existing branch: ${dogfoodBranchName}`);
    } catch (error) {
        if (error.status === 404) {
            await github.rest.git.createRef({
                owner: github.context.repo.owner,
                repo: github.context.repo.repo,
                ref: `refs/heads/${dogfoodBranchName}`,
                sha: prHead
            });
            console.log(`Created new branch: ${dogfoodBranchName}`);
        } else {
            throw error;
        }
    }
    console.log(`Successfully created/updated dogfood branch for PR #${prNumber}`);
}

module.exports = async ({ github, context, core }) => {
    let prInfo;
    if (context.eventName === 'pull_request' && context.payload.action === 'labeled') {
        prInfo = extractPRInfoFromLabeledPR(context);
    } else if (context.eventName === 'workflow_run') {
        prInfo = await extractPRInfoFromWorkflowRun(github, context);
    } else if (context.eventName === 'check_suite' && context.payload.action === 'completed') {
        prInfo = await extractPRInfoFromCheckSuite(github, context);
    } else {
        console.log('Event not handled by this script.');
        return;
    }
    if (!prInfo) {
        console.log('No PR info found for this event.');
        return;
    }
    const { prNumber, prHead, branchName, hasDogfoodLabel } = prInfo;
    console.log(`PR #${prNumber} details:`);
    console.log(`- Head SHA: ${prHead}`);
    console.log(`- Branch: ${branchName}`);
    console.log(`- Has dogfood label: ${hasDogfoodLabel}`);
    if (!hasDogfoodLabel) {
        console.log('PR does not have the dogfood label, skipping branch creation');
        core.notice('skipped: no dogfood label');
        return;
    }
    const { data: checkRuns } = await github.rest.checks.listForRef({
        owner: context.repo.owner,
        repo: context.repo.repo,
        ref: prHead
    });
    for (const run of checkRuns.check_runs) {
        console.log(`Check run details:`, JSON.stringify(run, null, 2));
    }
    const allChecksSuccessful = checkRuns.check_runs.every(
        check => check.status === 'completed' && check.conclusion === 'success'
    );
    console.log(`Checks are ${allChecksSuccessful ? 'green' : 'not green'} for PR #${prNumber}`);
    if (!allChecksSuccessful) {
        console.log('Not all checks are green, skipping branch creation');
        return;
    }
    await createOrUpdateDogfoodBranch(github, core, prNumber, prHead, branchName);
}
