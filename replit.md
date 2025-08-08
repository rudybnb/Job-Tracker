# JobFlow - GPS Time Tracking & Job Management System

## Overview
JobFlow is a GPS-based time tracking and job management application designed for contractors. It offers GPS-verified time tracking, file upload capabilities for job creation, comprehensive admin dashboards, and direct job assignment workflows. The system aims to provide a robust solution for managing contractor operations, from time tracking and compliance to job assignment and progress monitoring.

## User Preferences
Preferred communication style: Simple, everyday language.
App Recreation Method: User prefers to provide visual references (screenshots/pictures) showing color schemes, layouts, and functionality rather than detailed written descriptions. Visual specifications are more effective for accurate app recreation.

**MANDATORY DEVELOPMENT RULES**: When making ANY changes to the system:
- **Rule 1: NEVER REWRITE WORKING CODE** - Only modify broken or non-functional parts, make incremental changes only
- **Rule 2: DATA INTEGRITY** - All data must come from authentic database sources, never use static/mock data
- **Rule 3: CSV DATA SUPREMACY** - When a job is uploaded via CSV, ONLY information in that CSV file must be used. NO assumptions, fallbacks, or old stored data permitted. If CSV data missing, display "Data Missing from CSV" rather than assumptions.
- Always verify what is currently working before making changes
- These rules are mandatory and must be followed at all times to prevent regression and data corruption

## System Architecture

### UI/UX Decisions
The application features a dark navy background (`#1e293b`) with muted yellow-grey headers and text (`#d97706`, `#ca8a04`), providing a softer, less bright aesthetic. Key UI elements include rounded cards with slate borders (`#374151`) and consistent bottom navigation with active state highlighting. The GPS coordinates and timer displays are designed to match provided screenshots precisely.

### Technical Implementations
**Frontend**:
- **Framework**: React with TypeScript, using Vite as the build tool.
- **UI**: Shadcn/ui components built on Radix UI primitives.
- **Styling**: Tailwind CSS with CSS variables for theming.
- **State Management**: TanStack React Query for server state.
- **Routing**: Wouter for lightweight client-side routing.
- **Form Handling**: React Hook Form with Zod validation.

**Backend**:
- **Runtime**: Node.js with Express.js.
- **Language**: TypeScript with ES modules.
- **API Design**: RESTful API endpoints with JSON responses.
- **File Processing**: Multer for CSV file uploads.

**Database**:
- **ORM**: Drizzle ORM configured for PostgreSQL.
- **Schema**: Includes `work_sessions`, `admin_settings`, `contractors`, `jobs`, and `csv_uploads` tables with defined relationships and status enums.
- **Validation**: Zod schemas for type-safe data validation.

**Core Features**:
- **GPS Security & Validation**: 1km proximity validation using Haversine formula, enforced working hours (7:45 AM - 5:00 PM), automatic logout at 5:00 PM sharp, and automatic GPS coordinate extraction from CSV postcode data.
- **Permanent Database Work Session Tracking**: Comprehensive `work_sessions` table stores all GPS and time data, with API endpoints for starting, ending, and retrieving sessions. Sessions are synchronized on page load to restore active tracking.
- **Saturday Overtime Admin Control**: `admin_settings` table allows administrators to enable/disable Saturday work, with validation against same time restrictions and GPS validation.
- **Location-Aware Job Detection**: Smart multi-site detection automatically identifies the nearest job site using Haversine distance, dynamically updating the Active Assignment section.
- **Contractor Onboarding**: A 6-step form captures personal information, right to work details, CIS/tax details, banking information, emergency contacts, and trade/tool information.
- **Admin Management**: Features include an Admin Applications Dashboard for reviewing and managing contractor applications, CIS management, and pay rate administration.
- **Authentication**: A proper login/logout system is implemented with session management.

### System Design Choices
The application adopts a complete workflow system with distinct role-based interfaces for administrators and contractors. The workflow spans from CSV upload and job creation to contractor assignment and progress monitoring. Architectural decisions prioritize persistence (PostgreSQL database), security (GPS validation), and user experience (streamlined interfaces, simplified forms).

### Recent Performance Issues Resolved (08/08/2025)
- Fixed missing database methods causing 500 errors on contractor assignment endpoints
- Cleaned up duplicate and non-functional API routes
- Optimized job assignment display with proper database integration
- Removed memory-intensive processes that were causing system sluggishness
- All core functionality now running smoothly with proper error handling

## External Dependencies

### Database Services
- **Neon Database**: Serverless PostgreSQL database.
- **Drizzle ORM**: Type-safe database operations for PostgreSQL.

### Cloud Storage
- **Google Cloud Storage**: Used for file storage.
- **Uppy**: File upload components with AWS S3 and dashboard support.

### UI and Styling Libraries
- **Radix UI**: Comprehensive component primitives.
- **Tailwind CSS**: Utility-first CSS framework.
- **Lucide React**: Icon library for UI components.

### Development Tools
- **Vite**: Build tool and development server.
- **ESBuild**: Fast JavaScript bundler.
- **TypeScript**: For type safety.