import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { LinearClient } from "@linear/sdk";
import * as dotenv from "dotenv";
import fs from "fs/promises";
import path from "path";
import { createHash } from "crypto";
import fetch from "node-fetch";
import { IssueFilter } from "@linear/sdk/dist/_generated_documents";
import pMap from "p-map";

// Load environment variables from .env file
dotenv.config();

// Get Linear API key from environment variables
const LINEAR_API_KEY = process.env.LINEAR_API_KEY;
if (!LINEAR_API_KEY) {
  console.error("Error: LINEAR_API_KEY environment variable is not set");
  process.exit(1);
}

// Initialize Linear client
const linearClient = new LinearClient({
    apiKey: LINEAR_API_KEY,
});

// Define a temporary directory for image downloads
const cwd = process.cwd();
const TEMP_DIR = path.join(cwd, "temp_images");

// Create the temp directory if it doesn't exist
async function ensureTempDir() {
  try {
    await fs.mkdir(TEMP_DIR, { recursive: true });
  } catch (error) {
    console.error("Failed to create temp directory:", error);
  }
}

// Function to extract image URLs from markdown
function extractImageUrls(markdown: string): string[] {
  // Match markdown image syntax: ![alt text](url)
  const imageRegex = /!\[.*?\]\((.*?)\)/g;
  const urls: string[] = [];
  let match;

  while ((match = imageRegex.exec(markdown)) !== null) {
    urls.push(match[1]);
  }

  console.log({urls})

  return urls;
}

// Download image and return local file path
async function downloadImage(url: string): Promise<string | null> {
  try {
    // Create a hash of the URL to use as filename
    const urlHash = createHash('md5').update(url).digest('hex');
    
    // Extract file extension from URL or default to .png
    const urlPath = new URL(url).pathname;
    const ext = path.extname(urlPath) || '.png';
    
    // Create the local file path
    const filePath = path.join(TEMP_DIR, `${urlHash}${ext}`);
    
    // Check if file already exists to avoid redownloading
    try {
      await fs.access(filePath);
      return filePath;
    } catch {
      // File doesn't exist, continue with download
    }

    if (!LINEAR_API_KEY) {
      throw new Error("LINEAR_API_KEY is not set");
    }
    
    // Download the image
    const response = await fetch(url, {
        headers: {
            "Authorization": LINEAR_API_KEY,
        }
    });
    
    if (!response.ok) {
      throw new Error(`Failed to download image: ${response.status} ${response.statusText}`);
    }
    
    // Get the image data as buffer
    const imageBuffer = await response.arrayBuffer();
    
    // Write to file
    await fs.writeFile(filePath, Buffer.from(imageBuffer));
    
    return filePath;
  } catch (error) {
    console.error(`Error downloading image from ${url}:`, error);
    return null;
  }
}

// Function to process text and download images
async function processMarkdownWithImages(markdown: string): Promise<{ text: string, images: { path: string, url: string }[] }> {
  if (!markdown) {
    return { text: "", images: [] };
  }
  
  const imageUrls = extractImageUrls(markdown);
  const images: { path: string, url: string }[] = [];
  
  // Download all images in parallel
  const downloadPromises = imageUrls.map(async (url) => {
    const localPath = await downloadImage(url);
    if (localPath) {
      images.push({ path: localPath, url });
    }
  });
  
  await Promise.all(downloadPromises);
  
  return { text: markdown, images };
}

// Format priority to human-readable form
function formatPriority(priority: number | null): string {
  if (priority === null) return "None";
  switch (priority) {
    case 0: return "No priority";
    case 1: return "Urgent";
    case 2: return "High";
    case 3: return "Medium";
    case 4: return "Low";
    default: return `Priority ${priority}`;
  }
}

// Create an MCP server
const server = new McpServer({
  name: "Linear-MCP-Server",
  version: "1.0.0"
});

// Define the get_ticket tool
server.tool(
  "get_ticket",
  "Get a Linear ticket by ID",
  {
    ticket_id: z.string().describe("The Linear ticket ID (e.g., LAR-14)")
  },
  async ({ ticket_id }) => {
    try {
      // Ensure temp directory exists
      await ensureTempDir();
      
      // Query Linear API for ticket details
      const issue = await linearClient.issue(ticket_id);
      
      if (!issue) {
        return {
          isError: true,
          content: [{ type: "text", text: `Ticket ${ticket_id} not found` }]
        };
      }
      
      // Get issue details
      const commentsConnection = await issue.comments()
      
      // Process the ticket description and download any images
      const { text: description, images } = await processMarkdownWithImages(issue.description || "");
      
      // Get assignee, state, and team information
      const [assignee, state, team] = await Promise.all([
        issue.assignee,
        issue.state,
        issue.team
      ]);
      
      // Fetch all comments
      const comments = commentsConnection ? commentsConnection.nodes : [];
      // Reverse the list of comments to show the oldest first
      comments.reverse()

      const commentDetails = await Promise.all(comments.map(async comment => {
        const user = await comment.user
        return {
          body: comment.body,
          userName: user?.name || "Unknown",
          createdAt: comment.createdAt
        };
      }));
      
      // Format the ticket details
      const formattedTicket = `
# ${issue.identifier}: ${issue.title}

## Status
State: ${state?.name || "Unknown"}
Priority: ${formatPriority(issue.priority)}
Assignee: ${assignee?.displayName || "Unassigned"}
Team: ${team?.name || "None"}
Created: ${new Date(issue.createdAt).toLocaleString()}
Updated: ${new Date(issue.updatedAt).toLocaleString()}

## Description
${description || "No description provided."}

## Comments
${commentDetails.length > 0 
  ? commentDetails.map(comment => 
      `### ${comment.userName} (${new Date(comment.createdAt).toLocaleString()})
${comment.body || "No comment body"}`
    ).join("\n\n")
  : "No comments on this ticket."}
`;

      // Prepare response with text and images
      const content: any[] = [{ type: "text", text: formattedTicket }];
      
      // Add images to response
      for (const image of images) {
        try {
          const imageData = await fs.readFile(image.path);
          content.push({
            type: "image",
            data: imageData.toString("base64"),
            mimeType: image.url.toLowerCase().endsWith(".jpg") || image.url.toLowerCase().endsWith(".jpeg")
              ? "image/jpeg"
              : "image/png"
          });
        } catch (error) {
          console.error("Error reading image file:", error);
        }
      }

      return { content };
    } catch (error) {
      console.error("Error fetching Linear ticket:", error);
      return {
        isError: true,
        content: [{ 
          type: "text", 
          text: `Error fetching ticket: ${error instanceof Error ? error.message : String(error)}` 
        }]
      };
    }
  }
);

interface SubIssue {
  identifier: string;
  title: string;
  stateName: string;
  assigneeName: string;
  priority: string;
}

// Define the get_my_issues tool
server.tool(
  "get_my_issues",
  "Get your assigned Linear issues",
  {
    state: z.enum(["active", "backlog", "completed", "canceled", "all"]).default("active")
      .describe("Filter by issue state (active, backlog, completed, canceled, all)")
  },
  async ({ state }) => {
    try {
      // Get current user
      const user = await linearClient.viewer;
      
      if (!user) {
        return {
          isError: true,
          content: [{ type: "text", text: "Could not determine the current user" }]
        };
      }
      
      // Set up filters based on state parameter
      const filters: IssueFilter = {
        assignee: { id: { eq: user.id } }
      };
      
      if (state !== "all") {
        if (state === "active") {
          filters.state = { type: { in: ["started", "unstarted"] } };
        } else if (state === "backlog") {
          filters.state = { type: { eq: "backlog" } };
        } else if (state === "completed") {
          filters.state = { type: { eq: "completed" } };
        } else if (state === "canceled") {
          filters.state = { type: { eq: "canceled" } };
        }
      }
      
      // Query issues
      const issuesConnection = await linearClient.issues({
        filter: filters,
        first: 20
      });
      
      const issues = issuesConnection.nodes;
      
      if (issues.length === 0) {
        return {
          content: [{ type: "text", text: `No ${state} issues found assigned to you.` }]
        };
      }
      
      // Get issue details with limited concurrency to avoid rate limiting
      const issueDetails = await pMap(issues, async (issue) => {
        const [state, team] = await Promise.all([
            issue.state,
            issue.team
        ]);
        
        // Get parent issue if exists
        let parentIdentifier: string | undefined;
        if (issue.parent) {
          const parent = await issue.parent;
          parentIdentifier = parent?.identifier;
        }
        
        // Get sub-issues with details if they exist
        let subIssues: SubIssue[] = [];
        const childrenConnection = await issue.children();
        if (childrenConnection && childrenConnection.nodes.length > 0) {
          // Get detailed information for each sub-issue
          subIssues = await Promise.all(
            childrenConnection.nodes.map(async (subIssue) => {
              const [subState, subAssignee] = await Promise.all([
                subIssue.state,
                subIssue.assignee
              ]);
              
              return {
                identifier: subIssue.identifier,
                title: subIssue.title,
                stateName: subState?.name || "Unknown",
                assigneeName: subAssignee?.displayName || "Unassigned",
                priority: formatPriority(subIssue.priority)
              };
            })
          );
        }
        
        return {
          id: issue.id,
          identifier: issue.identifier,
          title: issue.title,
          stateName: state?.name || "Unknown",
          teamName: team?.name || "Unknown",
          priority: formatPriority(issue.priority),
          updatedAt: new Date(issue.updatedAt).toLocaleString(),
          parentIssue: parentIdentifier,
          subIssues: subIssues
        };
      }, { concurrency: 3 }); // Process 3 issues at a time

      // Format the response as a simple list
      const formattedIssues = `
# Your ${state} Linear Issues (${issueDetails.length})

${issueDetails.map(issue => {
  let details = `- **${issue.identifier}**: ${issue.title}
  Status: ${issue.stateName} | Team: ${issue.teamName} | Priority: ${issue.priority} | Updated: ${issue.updatedAt}`;
  
  if (issue.parentIssue) {
    details += `\n  Parent: ${issue.parentIssue}`;
  }
  
  if (issue.subIssues && issue.subIssues.length > 0) {
    details += `\n  Sub-issues:`;
    issue.subIssues.forEach(subIssue => {
      details += `\n    - **${subIssue.identifier}**: ${subIssue.title}`;
      details += `\n      Status: ${subIssue.stateName} | Assignee: ${subIssue.assigneeName} | Priority: ${subIssue.priority}`;
    });
  }
  
  return details;
}).join('\n\n')}

For more details on any issue, use the get_ticket tool with the issue ID.
`;

      return {
        content: [{ type: "text", text: formattedIssues }]
      };
    } catch (error) {
      console.error("Error fetching assigned issues:", error);
      return {
        isError: true,
        content: [{ 
          type: "text", 
          text: `Error fetching assigned issues: ${error instanceof Error ? error.message : String(error)}` 
        }]
      };
    }
  }
);

// Define the add_comment tool
server.tool(
  "add_comment",
  "Add a comment to a Linear ticket",
  {
    ticket_id: z.string().describe("The Linear ticket ID (e.g., LAR-14)"),
    comment: z.string().describe("The comment text to add")
  },
  async ({ ticket_id, comment }) => {
    try {
      // Get the issue
      const issue = await linearClient.issue(ticket_id);
      
      if (!issue) {
        return {
          isError: true,
          content: [{ type: "text", text: `Ticket ${ticket_id} not found` }]
        };
      }
      
      // Add the comment
      const newComment = await linearClient.createComment({
        issueId: issue.id,
        body: comment
      }).then(res => res.comment);

      if (!newComment) {
        return {
          isError: true,
          content: [{ type: "text", text: "Failed to create comment" }]
        };
      }
      
      return {
        content: [{ 
          type: "text", 
          text: `Successfully added comment to ${ticket_id}. Comment ID: ${newComment.id}` 
        }]
      };
    } catch (error) {
      console.error("Error adding comment:", error);
      return {
        isError: true,
        content: [{ 
          type: "text", 
          text: `Error adding comment: ${error instanceof Error ? error.message : String(error)}` 
        }]
      };
    }
  }
);

// Define the create_issue tool
server.tool(
  "create_issue",
  "Create a new Linear issue",
  {
    team_id: z.string().describe("The Linear team ID (required)"),
    title: z.string().describe("The title of the issue"),
    description: z.string().optional().describe("The description of the issue (optional)"),
    priority: z.number().min(0).max(4).optional().describe("Priority level (0-4): 0=No priority, 1=Urgent, 2=High, 3=Medium, 4=Low"),
    assignee_id: z.string().optional().describe("The ID of the user to assign (optional)"),
    parent_issue_id: z.string().optional().describe("Parent issue identifier (e.g., LAR-14) to create this as a sub-issue (optional)")
  },
  async ({ team_id, title, description, priority, assignee_id, parent_issue_id }) => {
    try {
      // Prepare create params
      const createParams: any = {
        teamId: team_id,
        title,
        description: description || "",
        priority,
        assigneeId: assignee_id
      };
      
      // If parent issue is specified, find it and add its ID
      if (parent_issue_id) {
        const parentIssue = await linearClient.issue(parent_issue_id);
        
        if (!parentIssue) {
          return {
            isError: true,
            content: [{ type: "text", text: `Parent issue ${parent_issue_id} not found` }]
          };
        }
        
        createParams.parentId = parentIssue.id;
      }
      
      // Create the issue
      const issueResult = await linearClient.createIssue(createParams);
      
      if (!issueResult.success || !issueResult.issue) {
        return {
          isError: true,
          content: [{ type: "text", text: "Failed to create issue" }]
        };
      }
      
      const issue = await issueResult.issue;
      
      // Get issue details and potential parent issue
      const [state, team, assignee, parentIssue] = await Promise.all([
        issue.state,
        issue.team,
        issue.assignee,
        issue.parent
      ]);
      
      const formattedIssue = `
# Issue Created: ${issue.identifier} - ${issue.title}

Status: ${state?.name || "Unknown"}
Team: ${team?.name || "Unknown"}
Priority: ${formatPriority(issue.priority)}
Assignee: ${assignee?.displayName || "Unassigned"}
${parentIssue ? `Parent Issue: ${parentIssue.identifier} - ${parentIssue.title}` : ''}
Created: ${new Date(issue.createdAt).toLocaleString()}

## Description
${issue.description || "No description provided."}

Use the get_ticket tool with ID ${issue.identifier} to view this issue in detail.
`;
      
      return {
        content: [{ type: "text", text: formattedIssue }]
      };
    } catch (error) {
      console.error("Error creating issue:", error);
      return {
        isError: true,
        content: [{ 
          type: "text", 
          text: `Error creating issue: ${error instanceof Error ? error.message : String(error)}` 
        }]
      };
    }
  }
);

// Define a tool to fetch teams for reference when creating issues
server.tool(
  "get_teams",
  "Get available Linear teams",
  {},
  async () => {
    try {
      const teamsConnection = await linearClient.teams();
      const teams = teamsConnection.nodes;
      
      if (teams.length === 0) {
        return {
          content: [{ type: "text", text: "No teams found in this workspace." }]
        };
      }
      
      const teamList = `
# Available Linear Teams

${teams.map(team => `- **${team.name}** (ID: ${team.id})`).join('\n')}

Use the team ID when creating a new issue with the create_issue tool.
`;
      
      return {
        content: [{ type: "text", text: teamList }]
      };
    } catch (error) {
      console.error("Error fetching teams:", error);
      return {
        isError: true,
        content: [{ 
          type: "text", 
          text: `Error fetching teams: ${error instanceof Error ? error.message : String(error)}` 
        }]
      };
    }
  }
);

// Start the server
async function main() {
  // Connect to stdio transport
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Linear MCP Server running on stdio");
}

// Function to clean up temporary files on exit
async function cleanup() {
  try {
    await fs.rm(TEMP_DIR, { recursive: true });
    console.error("Cleaned up temporary files");
  } catch (error) {
    console.error("Failed to delete temp directory:", error);
  }
}

// Register cleanup handlers for graceful shutdown
process.on('SIGINT', async () => {
  console.error("Received SIGINT, cleaning up...");
  await cleanup();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.error("Received SIGTERM, cleaning up...");
  await cleanup();
  process.exit(0);
});

main().catch(error => {
  console.error("Fatal error starting server:", error);
  process.exit(1);
})