import { Octokit } from "octokit";
import { GitHubConfig, PluginFile, PushResult } from "../types";

export async function pushToGitHub(config: GitHubConfig, files: PluginFile[], commitMessage: string): Promise<PushResult> {
  const octokit = new Octokit({ auth: config.token });
  let repoCreated = false;

  // 0. Verify repository exists and token has access
  try {
    await octokit.rest.repos.get({
      owner: config.owner,
      repo: config.repo,
    });
  } catch (error: any) {
    if (error.status === 404) {
      console.log(`Repository "${config.owner}/${config.repo}" not found. Attempting to create it.`);
      try {
        // Try to get the authenticated user to see if the owner matches
        const { data: user } = await octokit.rest.users.getAuthenticated();
        
        if (user.login.toLowerCase() === config.owner.toLowerCase()) {
          // Create for authenticated user
          await octokit.rest.repos.createForAuthenticatedUser({
            name: config.repo,
            private: true, // Default to private for safety
            auto_init: false,
          });
          console.log(`Created repository "${config.owner}/${config.repo}" for user.`);
        } else {
          // Try to create in organization
          await octokit.rest.repos.createInOrg({
            org: config.owner,
            name: config.repo,
            private: true,
            auto_init: false,
          });
          console.log(`Created repository "${config.owner}/${config.repo}" in organization.`);
        }
        repoCreated = true;
        // Small delay to allow GitHub to propagate the new repository
        await new Promise(resolve => setTimeout(resolve, 2000));
      } catch (createError: any) {
        console.error("Failed to create repository automatically:", createError);
        const detail = createError.status === 403 ? "Token lacks 'repo' permissions." : createError.message;
        throw new Error(`Repository "${config.owner}/${config.repo}" not found and could not be created automatically. Detail: ${detail}`);
      }
    } else if (error.status === 401 || error.status === 403) {
      throw new Error(`Authentication error (Status ${error.status}). Please check if your GitHub token is valid and has "repo" permissions.`);
    } else {
      throw error;
    }
  }

  let latestCommitSha: string | null = null;
  let baseTreeSha: string | null = null;

  try {
    // 1. Get the latest commit SHA of the branch
    const { data: refData } = await octokit.rest.git.getRef({
      owner: config.owner,
      repo: config.repo,
      ref: `heads/${config.branch}`,
    });
    latestCommitSha = refData.object.sha;

    // 2. Get the tree SHA of the latest commit
    const { data: commitData } = await octokit.rest.git.getCommit({
      owner: config.owner,
      repo: config.repo,
      commit_sha: latestCommitSha,
    });
    baseTreeSha = commitData.tree.sha;
  } catch (error: any) {
    // If the repository is empty, we'll "seed" it with the first file using the high-level API
    // This initializes the branch and allows the low-level Git Data API to work for subsequent files
    if (error.status === 404 || error.status === 409 || error.message.includes("Git Repository is empty")) {
      console.log("Repository is empty or branch not found. Seeding with first file.");
      
      const firstFile = files[0];
      
      try {
        // For the very first commit in an empty repo, we try WITHOUT the branch parameter first
        // if the branch doesn't exist yet, as GitHub will create the default branch.
        // If that fails or if we want a specific branch, we'll handle it.
        const { data: seedData } = await octokit.rest.repos.createOrUpdateFileContents({
          owner: config.owner,
          repo: config.repo,
          path: firstFile.path,
          message: `Initial commit: ${firstFile.path}`,
          content: btoa(unescape(encodeURIComponent(firstFile.content))),
          // Only specify branch if we are sure it's not the very first commit or if we want to force it
          // But for an empty repo, omitting it is safer to avoid 404 on the branch itself
          branch: latestCommitSha ? config.branch : undefined,
        });

        latestCommitSha = seedData.commit.sha!;
        baseTreeSha = seedData.commit.tree?.sha || null;
      } catch (seedError: any) {
        console.error("Seeding failed:", seedError);
        // If it still fails with 404, it might be a permission issue or the repo really doesn't exist
        if (seedError.status === 404) {
          throw new Error(`Failed to initialize repository. This often happens if the GitHub token lacks "repo" permissions or if the repository name is incorrect.`);
        }
        throw seedError;
      }
      
      // If there was only one file, we are done
      if (files.length === 1) {
        return {
          sha: latestCommitSha,
          url: `https://github.com/${config.owner}/${config.repo}/commit/${latestCommitSha}`,
          created: repoCreated
        };
      }
      
      // Otherwise, remove the first file and continue with the rest using the tree API
      files = files.slice(1);
    } else {
      throw error;
    }
  }

  // 3. Prepare tree items
  // Using 'content' instead of creating blobs individually avoids "Git Repository is empty" errors
  // on newly created repositories and is more efficient for small-to-medium files.
  const treeItems = files.map((file) => ({
    path: file.path,
    mode: "100644" as const,
    type: "blob" as const,
    content: file.content,
  }));

  // 4. Create a new tree
  const { data: treeData } = await octokit.rest.git.createTree({
    owner: config.owner,
    repo: config.repo,
    base_tree: baseTreeSha || undefined,
    tree: treeItems,
  });

  // 5. Create a new commit
  const { data: newCommitData } = await octokit.rest.git.createCommit({
    owner: config.owner,
    repo: config.repo,
    message: commitMessage,
    tree: treeData.sha,
    parents: latestCommitSha ? [latestCommitSha] : [],
  });

  // 6. Update the reference
  if (latestCommitSha) {
    await octokit.rest.git.updateRef({
      owner: config.owner,
      repo: config.repo,
      ref: `heads/${config.branch}`,
      sha: newCommitData.sha,
    });
  } else {
    // Create the reference if it doesn't exist
    await octokit.rest.git.createRef({
      owner: config.owner,
      repo: config.repo,
      ref: `refs/heads/${config.branch}`,
      sha: newCommitData.sha,
    });
  }

  return {
    sha: newCommitData.sha,
    url: `https://github.com/${config.owner}/${config.repo}/commit/${newCommitData.sha}`,
    created: repoCreated
  };
}
