import { join } from 'path';

export async function serveStatic(
  req: Request,
  distDir: string,
): Promise<Response> {
  const url = new URL(req.url);
  let pathname = url.pathname;

  // Remove leading slash and handle root
  if (pathname === '/') {
    pathname = 'index.html';
  } else {
    pathname = pathname.slice(1);
  }

  const filePath = join(distDir, pathname);

  try {
    const file = Bun.file(filePath);
    const exists = await file.exists();

    if (exists) {
      return new Response(file);
    }

    // For SPA routing: if file doesn't exist and it's not requesting a file with extension,
    // serve index.html to allow client-side routing
    if (!pathname.includes('.')) {
      const indexFile = Bun.file(join(distDir, 'index.html'));
      const indexExists = await indexFile.exists();

      if (indexExists) {
        return new Response(indexFile, {
          headers: { 'Content-Type': 'text/html' },
        });
      }
    }

    // Return 404 page
    return new Response(get404Page(), {
      status: 404,
      headers: { 'Content-Type': 'text/html' },
    });
  } catch (error) {
    console.error('Error serving static file:', error);
    return new Response('Internal Server Error', { status: 500 });
  }
}

function get404Page(): string {
  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>404 - Not Found</title>
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
      padding: 2rem;
    }
    .container {
      text-align: center;
      max-width: 600px;
    }
    h1 {
      font-size: 8rem;
      font-weight: 700;
      margin-bottom: 1rem;
      text-shadow: 2px 2px 4px rgba(0, 0, 0, 0.3);
    }
    h2 {
      font-size: 2rem;
      font-weight: 500;
      margin-bottom: 1rem;
    }
    p {
      font-size: 1.2rem;
      margin-bottom: 2rem;
      opacity: 0.9;
    }
    a {
      display: inline-block;
      padding: 1rem 2rem;
      background: white;
      color: #667eea;
      text-decoration: none;
      border-radius: 8px;
      font-weight: 600;
      transition: transform 0.2s, box-shadow 0.2s;
      box-shadow: 0 4px 6px rgba(0, 0, 0, 0.2);
    }
    a:hover {
      transform: translateY(-2px);
      box-shadow: 0 6px 12px rgba(0, 0, 0, 0.3);
    }
  </style>
</head>
<body>
  <div class="container">
    <h1>404</h1>
    <h2>Page Not Found</h2>
    <p>The page you're looking for doesn't exist or has been moved.</p>
    <a href="/">Go Home</a>
  </div>
</body>
</html>
  `.trim();
}
