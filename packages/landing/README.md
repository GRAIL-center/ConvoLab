# Landing Package

Astro 5 static landing pages for the Conversation Coach platform.

## Overview

This package provides public-facing landing pages built with:
- **Astro 5**: Modern static site generator
- **Tailwind CSS 3**: Utility-first styling
- **Static output**: Fast, SEO-friendly pages

These pages are separate from the main React app to provide:
- Server-side rendering for link previews
- SEO optimization
- Fast initial page loads
- Shareable scenario links

## Project Structure

```
packages/landing/src/
├── pages/
│   └── index.astro     # Homepage
└── layouts/            # Shared layouts (TODO)
```

## Running Locally

```bash
# From root
pnpm -F @workspace/landing dev

# Opens at http://localhost:4321
```

## Configuration

### Astro Config

```javascript
// astro.config.mjs
export default defineConfig({
  integrations: [tailwind()],
  output: 'static',  // Static site generation
  server: {
    port: 4321,
  },
});
```

### Tailwind Config

Currently using default Tailwind settings. To customize:

```bash
# Create config if needed
touch tailwind.config.js
```

**Note**: You'll see a Tailwind warning about missing content configuration during builds. This doesn't break anything, but you can fix it by creating a `tailwind.config.js`:

```javascript
// tailwind.config.js
export default {
  content: ['./src/**/*.{astro,html,js,jsx,md,mdx,svelte,ts,tsx,vue}'],
  theme: {
    extend: {},
  },
  plugins: [],
};
```

## Creating Pages

### Basic Page

```astro
---
// src/pages/about.astro
const title = "About Conversation Coach";
---

<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <title>{title}</title>
  </head>
  <body>
    <h1>{title}</h1>
    <p>Practice difficult conversations with AI assistance.</p>
  </body>
</html>
```

### Dynamic Routes (TODO)

For scenario pages:

```astro
---
// src/pages/scenarios/[slug].astro
import { prisma } from '@workspace/database';

export async function getStaticPaths() {
  const scenarios = await prisma.scenario.findMany();
  return scenarios.map((scenario) => ({
    params: { slug: scenario.slug },
    props: { scenario },
  }));
}

const { scenario } = Astro.props;
---

<html lang="en">
  <head>
    <title>{scenario.name} - Conversation Coach</title>
    <meta name="description" content={scenario.description} />

    <!-- Open Graph for link previews -->
    <meta property="og:title" content={scenario.name} />
    <meta property="og:description" content={scenario.description} />
  </head>
  <body>
    <h1>{scenario.name}</h1>
    <p>{scenario.description}</p>
    <a href="/app">Start Conversation →</a>
  </body>
</html>
```

### Layouts (TODO)

Shared layout for consistent navigation:

```astro
---
// src/layouts/Base.astro
const { title } = Astro.props;
---

<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width" />
    <title>{title} - Conversation Coach</title>
  </head>
  <body>
    <nav>
      <!-- Navigation here -->
    </nav>
    <main>
      <slot />
    </main>
    <footer>
      <!-- Footer here -->
    </footer>
  </body>
</html>
```

Usage:
```astro
---
// src/pages/about.astro
import Base from '../layouts/Base.astro';
---

<Base title="About">
  <h1>About Us</h1>
  <p>Content goes here</p>
</Base>
```

## Styling

### Using Tailwind

```astro
---
const pageTitle = "Conversation Coach";
---

<html lang="en">
  <body class="min-h-screen bg-gray-50">
    <main class="mx-auto max-w-7xl px-4 py-16">
      <h1 class="text-4xl font-bold text-gray-900">
        {pageTitle}
      </h1>
      <button class="mt-6 rounded-md bg-blue-600 px-4 py-2 text-white hover:bg-blue-700">
        Get Started
      </button>
    </main>
  </body>
</html>
```

### Custom CSS (Optional)

```astro
---
// src/pages/index.astro
---

<style>
  .custom-class {
    /* Custom styles here */
  }
</style>

<html>
  <body>
    <div class="custom-class">Content</div>
  </body>
</html>
```

## Building for Production

```bash
# Build static site
pnpm -F @workspace/landing build

# Preview production build
pnpm -F @workspace/landing preview
```

Output goes to `dist/` directory - deploy these static files anywhere!

## Deployment

Astro static sites can be deployed to:
- **Vercel**: Zero-config deployment
- **Netlify**: Drag-and-drop or Git integration
- **Google Cloud Storage**: Static file hosting
- **GitHub Pages**: Free hosting for open source
- **Cloudflare Pages**: Fast global CDN

Example (Vercel):
```bash
npm i -g vercel
cd packages/landing
vercel --prod
```

## Link Previews

For proper social media link previews, add Open Graph tags:

```astro
<head>
  <meta property="og:type" content="website" />
  <meta property="og:title" content="Conversation Coach" />
  <meta property="og:description" content="Practice difficult conversations" />
  <meta property="og:image" content="/og-image.jpg" />
  <meta property="og:url" content="https://yoursite.com" />

  <!-- Twitter -->
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="Conversation Coach" />
  <meta name="twitter:description" content="Practice difficult conversations" />
  <meta name="twitter:image" content="/og-image.jpg" />
</head>
```

## Fetching Data from API (Optional)

You can fetch data from the Fastify API:

```astro
---
// src/pages/index.astro
const response = await fetch('http://localhost:3000/api/scenarios');
const scenarios = await response.json();
---

<html>
  <body>
    {scenarios.map((s) => (
      <div>{s.name}</div>
    ))}
  </body>
</html>
```

**Note**: This happens at build time for static sites!

## Troubleshooting

### Tailwind warning about missing content

Create a `tailwind.config.js`:

```javascript
export default {
  content: ['./src/**/*.{astro,html,js,jsx,md,mdx,svelte,ts,tsx,vue}'],
};
```

### Changes not appearing

Restart dev server:

```bash
pnpm -F @workspace/landing dev
```

### Build errors

Clear Astro cache:

```bash
rm -rf .astro
pnpm -F @workspace/landing build
```

## Why Astro for Landing Pages?

- **Fast**: Ships zero JavaScript by default
- **SEO-friendly**: Server-rendered HTML
- **Flexible**: Can add React/Vue components if needed
- **Simple**: Easy to understand and modify

## Adding Interactivity (Optional)

Astro supports "islands" of interactivity:

```astro
---
// src/components/Counter.tsx (React)
import { useState } from 'react';

export function Counter() {
  const [count, setCount] = useState(0);
  return <button onClick={() => setCount(count + 1)}>{count}</button>;
}
---

<!-- Use in Astro page -->
---
import { Counter } from '../components/Counter';
---

<html>
  <body>
    <Counter client:load />
  </body>
</html>
```

Only the Counter component gets JavaScript - rest is static!

## Resources

- [Astro Documentation](https://docs.astro.build/)
- [Astro Tailwind Integration](https://docs.astro.build/en/guides/integrations-guide/tailwind/)
- [Astro Static Rendering](https://docs.astro.build/en/core-concepts/rendering-modes/#static-rendering)

## Future Enhancements (TODO)

- [ ] Add scenario listing page
- [ ] Create dynamic scenario detail pages
- [ ] Add navigation and footer layout
- [ ] Improve SEO with structured data
- [ ] Add blog for tips and updates
- [ ] Create press kit page

Keep it simple - focus on clear messaging and fast page loads!
