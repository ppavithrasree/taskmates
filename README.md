# TaskMates

A mobile-first social productivity demo built with React, Vite, Tailwind CSS, and reusable UI components.

## Features

- Landing page
- Login and registration with local browser storage
- Dashboard with personal stats and friend activity
- Task add, edit, and delete flows
- Friend search, requests, and accepted connections
- Public, private, and custom task privacy controls
- Editable profile page with task history and streak stats

## Structure

- `src/components/brand` shared brand elements
- `src/components/layout` app shell and navigation
- `src/components/ui` reusable shadcn-style primitives
- `src/features/tasks` task cards and forms
- `src/features/friends` friend search/list components
- `src/features/privacy` privacy controls
- `src/context` local app state and actions
- `src/pages` route-level screens
