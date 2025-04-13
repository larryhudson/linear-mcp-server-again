# Linear MCP Server

## Overview

This project implements a Model Context Protocol (MCP) server that acts as a bridge between Claude and the Linear task/issue management system. It allows Claude to interact with Linear through the following tools:

1. **get_ticket** - Retrieve detailed information about a specific Linear ticket
2. **get_my_issues** - List issues assigned to the current user with filtering by state
3. **add_comment** - Add comments to Linear tickets
4. **create_issue** - Create a new issue in Linear
5. **get_teams** - Retrieve available teams for reference

## Installation

```bash
# Install from npm
npm install linear-mcp-server

# Or install globally
npm install -g linear-mcp-server
```

## Setup

1. Create a `.env` file with your Linear API key:

```
LINEAR_API_KEY=your_linear_api_key_here
```

2. Obtain a Linear API key from your Linear account settings.

## Usage

### As a library

```javascript
import { startServer } from 'linear-mcp-server';

// Start the MCP server
startServer();
```

### As a command-line tool

If installed globally:

```bash
linear-mcp-server
```

This will start the MCP server that communicates with Claude through stdin/stdout.

### Environment Variables

- `LINEAR_API_KEY` - Your Linear API key (required)

## How It Works

The server is built on the following key technologies:

- **Model Context Protocol (MCP)** - Framework for allowing AI assistants to interact with external tools and APIs
- **Linear SDK** - Client library for communicating with the Linear API
- **Node.js** - JavaScript runtime environment
- **Zod** - Type validation library for tool parameters

## Key Features

### Ticket Retrieval
- Gets comprehensive ticket details including status, priority, assignee, and team
- Fetches the full description and all comments 
- Processes Markdown content with embedded images
- Downloads and includes images from ticket descriptions

### Issue Listing
- Retrieves issues assigned to the current user
- Filters by state (active, backlog, completed, canceled, or all)
- Returns a formatted table with key information about each issue

### Comment Addition
- Allows adding new comments to existing tickets
- Provides confirmation of successful comment creation

## Technical Implementation Details

1. **Image Handling**
   - Extracts image URLs from Markdown using regular expressions
   - Downloads images to a local temp directory
   - Converts images to base64 for inclusion in MCP responses
   - Uses MD5 hashing of URLs to create unique filenames

2. **Linear API Integration**
   - Authenticates using a Linear API key
   - Retrieves issues, tickets, comments, and user information
   - Formats data for human-readable display

3. **Error Handling**
   - Gracefully handles API errors, missing tickets, and download failures
   - Provides meaningful error messages to the user

## Running the Server

The server communicates with Claude through standard input/output (stdio) using the MCP protocol. It requires:

- A Linear API key (configured in the code)
- Node.js runtime environment
- The dependency packages specified in package.json

## Project Structure

This is a relatively simple Node.js application with a single main source file (`index.ts`) that defines the MCP server, tools, and associated helper functions. It uses TypeScript for type safety and better developer experience.

## Dependencies

- `@modelcontextprotocol/sdk`: Core MCP implementation
- `@linear/sdk`: Linear API client
- `dotenv`: Environment variable management
- `node-fetch`: HTTP client for image downloads
- `zod`: Schema validation for tool parameters

## Limitations and Potential Improvements

- The API key is hardcoded rather than being stored in an environment variable
- There's limited pagination support for large result sets
- Error handling could be improved, especially for edge cases
- The image downloading could benefit from caching and better MIME type detection