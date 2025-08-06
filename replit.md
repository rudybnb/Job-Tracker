# JobFlow - GPS Time Tracking & Job Management System

## Overview

JobFlow is a GPS-based time tracking and job management application for contractors. The system includes GPS-verified time tracking, file upload capabilities for job creation, admin dashboards, and direct job assignment workflows with Telegram notifications.

## User Preferences

Preferred communication style: Simple, everyday language.

App Recreation Method: User prefers to provide visual references (screenshots/pictures) showing color schemes, layouts, and functionality rather than detailed written descriptions. Visual specifications are more effective for accurate app recreation.

## Recent Changes (August 6, 2025)

✓ Transformed application into GPS-based time tracking and job management system based on user screenshots
✓ Created GPS Dashboard (/) - GPS coordinates, real-time timer, "Start Work" functionality  
✓ Built Upload Job page (/upload) - HBXL CSV/PDF file uploads with approval workflow
✓ Implemented Admin Dashboard (/admin) - Statistics overview and quick action buttons
✓ Added Jobs page (/jobs) - Direct job assignments with Telegram notification integration
✓ Applied consistent dark navy theme with yellow headers across all pages
✓ Integrated bottom navigation system connecting Dashboard, Jobs, Admin, Upload Job
✓ Added comprehensive avatar dropdown menu with 15+ management options including contractor onboarding, cost analysis, and project tools
✓ Created Contractor Onboarding page with form fields and Telegram integration for sending forms to new contractors
✓ Built 6-step contractor application form covering personal info, right to work, CIS details, banking, emergency contacts, and trade information
✓ Enhanced job assignments with phase selection system for HBXL projects (Footings, Foundations, Groundwork, etc.)
✓ Created login page with blue gradient background, yellow-bordered username field, and orange Sign In button
✓ Built complete CSV → Job → HBXL → Phase → Subtask workflow system
✓ Created contractor task progress interface with detailed progress tracking and +/- controls
✓ Implemented Direct Job Assignments page showing available jobs for contractors
✓ Added Admin Task Monitor for real-time contractor progress and time tracking oversight
✓ All pages recreated exactly according to user-provided screenshots

## Application Structure

Complete workflow system with role-based interfaces:

### Admin Interface:
1. **Upload Job (/upload)** - CSV/PDF upload creates jobs automatically
2. **Job Assignments (/job-assignments)** - Assign HBXL job types and select phases
3. **Admin Task Monitor (/admin-task-monitor)** - Monitor contractor progress and time tracking
4. **Admin Dashboard (/admin)** - Management interface with statistics and quick actions

### Contractor Interface:
1. **GPS Dashboard (/)** - Time tracking with GPS verification (James Carpenter perspective)
2. **Direct Job Assignments (/jobs)** - View available job assignments
3. **Task Progress (/task-progress)** - Work on assigned subtasks with progress tracking

### Complete Workflow:
CSV Upload → Job Creation → HBXL Assignment → Phase Selection → Subtask Breakdown → Contractor Assignment → Progress Monitoring

## User Interface Theme

Dark navy background (#1e293b) with:
- Yellow/orange headers and action buttons (#eab308, #ea580c)
- Rounded cards with slate borders (#374151)
- Consistent bottom navigation with active state highlighting
- GPS coordinates and timer displays matching provided screenshots exactly

## System Architecture

### Frontend Architecture
- **Framework**: React with TypeScript using Vite as the build tool
- **UI Library**: Shadcn/ui components built on Radix UI primitives
- **Styling**: Tailwind CSS with CSS variables for theming
- **State Management**: TanStack React Query for server state management
- **Routing**: Wouter for lightweight client-side routing
- **Form Handling**: React Hook Form with Zod validation

### Backend Architecture
- **Runtime**: Node.js with Express.js server
- **Language**: TypeScript with ES modules
- **API Design**: RESTful API endpoints with JSON responses
- **Storage**: In-memory storage implementation with interface for future database integration
- **File Processing**: Multer for CSV file uploads with parsing capabilities
- **Development**: Hot reloading with Vite middleware integration

### Database Schema
- **ORM**: Drizzle ORM configured for PostgreSQL
- **Tables**: 
  - `contractors` - contractor information and status
  - `jobs` - job details with status tracking
  - `csv_uploads` - file upload metadata and processing status
- **Enums**: Status enums for jobs, contractors, and uploads
- **Relationships**: Foreign key relationships between jobs and contractors

### Data Storage Solutions
- **Current**: In-memory storage with seeded data for development
- **Configured**: PostgreSQL with Neon Database serverless connection
- **Migration**: Drizzle Kit for schema migrations
- **Validation**: Zod schemas for type-safe data validation

### Authentication and Authorization
- **Current**: No authentication implemented
- **Prepared**: Express middleware structure ready for auth integration
- **Session**: Cookie-based session management configured

## External Dependencies

### Database Services
- **Neon Database**: Serverless PostgreSQL database (configured via DATABASE_URL)
- **Drizzle ORM**: Type-safe database operations with PostgreSQL dialect

### Cloud Storage
- **Google Cloud Storage**: File storage service integration
- **Uppy**: File upload components with AWS S3 and dashboard support

### UI and Styling
- **Radix UI**: Comprehensive component primitives
- **Tailwind CSS**: Utility-first CSS framework
- **Lucide React**: Icon library for UI components

### Development Tools
- **Vite**: Build tool and development server
- **ESBuild**: Fast JavaScript bundler for production
- **TypeScript**: Type safety and enhanced developer experience
- **Replit Integration**: Development environment optimizations