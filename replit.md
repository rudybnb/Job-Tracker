# JobFlow - GPS Time Tracking & Job Management System

## Overview
JobFlow is a GPS-based time tracking and job management application for contractors. It provides GPS-verified time tracking, file upload capabilities for job creation, comprehensive admin dashboards, and direct job assignment workflows. The system aims to be a robust solution for managing contractor operations, from time tracking and compliance to job assignment and progress monitoring, enhancing efficiency and ensuring accurate record-keeping.

## User Preferences
Preferred communication style: Simple, everyday language.
App Recreation Method: User prefers to provide visual references (screenshots/pictures) showing color schemes, layouts, and functionality rather than detailed written descriptions. Visual specifications are more effective for accurate app recreation.
**CRITICAL USER CONCERN**: User losing confidence in Replit due to data loss and having to redo completed work. Priority: Ensure 100% data persistence and prevent any regression of working features.

**MANDATORY DEVELOPMENT RULES - ZERO TOLERANCE FOR DATA LOSS**: When making ANY changes to the system:
- **Rule 1: NEVER REWRITE WORKING CODE** - Only modify broken or non-functional parts, make incremental changes only
- **Rule 2: DATA INTEGRITY** - All data must come from authentic database sources, never use static/mock data
- **Rule 3: CSV DATA SUPREMACY** - When a job is uploaded via CSV, ONLY information in that CSV file must be used. NO assumptions, fallbacks, or old stored data permitted. If CSV data missing, display "Data Missing from CSV" rather than assumptions.
- **Rule 4: ZERO REGRESSION POLICY** - Before ANY code changes, verify current functionality works and test after changes
- **Rule 5: PERSISTENT DATA VERIFICATION** - Always verify database data exists and is accessible before claiming features work
- **Rule 6: USER CONFIDENCE PROTECTION** - Document all fixes permanently and ensure they persist across sessions
- **Rule 7: LOCKED CSV PARSING** - The CSV parsing logic in both frontend and backend is now locked down with regex to remove trailing commas. DO NOT MODIFY the parsing sections marked "LOCKED DOWN" or "NEVER CHANGE THIS"
- Always verify what is currently working before making changes
- These rules are mandatory and must be followed at all times to prevent regression and data corruption

## System Architecture

### UI/UX Decisions
The application features a dark navy background (`#1e293b`) with muted yellow-grey headers and text (`#d97706`, `#ca8a04`). UI elements include rounded cards with slate borders (`#374151`) and consistent bottom navigation. GPS coordinates and timer displays are designed for precise visual matching.

### Technical Implementations
**Frontend**:
- **Framework**: React with TypeScript, Vite.
- **UI**: Shadcn/ui components on Radix UI primitives.
- **Styling**: Tailwind CSS with CSS variables.
- **State Management**: TanStack React Query.
- **Routing**: Wouter.
- **Form Handling**: React Hook Form with Zod validation.

**Backend**:
- **Runtime**: Node.js with Express.js.
- **Language**: TypeScript with ES modules.
- **API Design**: RESTful API with JSON.
- **File Processing**: Multer for CSV uploads.

**Database**:
- **ORM**: Drizzle ORM for PostgreSQL.
- **Schema**: Includes `work_sessions`, `admin_settings`, `contractors`, `jobs`, and `csv_uploads` tables.
- **Validation**: Zod schemas for type-safe data validation.

**Core Features**:
- **GPS Security & Validation**: 1km proximity validation, enforced working hours (7:45 AM - 5:00 PM), automatic logout, and GPS coordinate extraction from CSV postcode data.
- **Permanent Database Work Session Tracking**: `work_sessions` table stores GPS and time data; API endpoints for session management and synchronization.
- **Weekend Overtime Admin Control**: `admin_settings` table allows independent admin control over Saturday and Sunday work with separate toggle switches.
- **Location-Aware Job Detection**: Multi-site detection identifies nearest job site, updating the Active Assignment.
- **Contractor Onboarding**: A 6-step form captures personal, right-to-work, tax, banking, emergency contact, and trade information.
- **Admin Management**: Admin Applications Dashboard for contractor review, CIS management, and pay rate administration.
- **Authentication**: Login/logout system with session management.
- **Admin Site Reporting Interface**: Transformed assignment details page for admin site visits, including photo upload, progress comments, and quality assessments.
- **CSV Upload Functionality**: Reinstated with new frontend components, preserving existing backend parsing, with a comprehensive preview system displaying raw and formatted data, and clear data/delete functionality.
- **Automatic Pay Calculation**: Computes total hours from work sessions, with punctuality deductions (£0.50/minute after 8:15 AM, max £50 deduction, min £100 daily pay), and 20% CIS deduction.
- **CSV Data Supremacy Enforcement**: Ensures task display uses only authentic CSV data, showing "Data Missing from CSV" if detailed breakdowns are unavailable.

### System Design Choices
The application offers a complete workflow with distinct role-based interfaces for administrators and contractors. It manages operations from CSV upload and job creation to contractor assignment and progress monitoring. Architectural decisions prioritize data persistence (PostgreSQL), security (GPS validation), and user experience.

### Recent Technical Achievements (August 9, 2025)
- **CSV Data Supremacy Implementation**: Successfully extracted authentic HBXL electrical task data, displaying 7 real tasks with quantities from actual construction CSV
- **Weekend Overtime Extension**: Extended overtime control system to include both Saturday and Sunday with independent admin toggles
- **Database Storage Enhancement**: Fixed `phaseTaskData` field retrieval ensuring authentic task information is properly stored and displayed
- **GPS Validation Enhancement**: Updated working hours logic to support configurable weekend overtime with full location validation maintained

## External Dependencies

### Database Services
- **Neon Database**: Serverless PostgreSQL.
- **Drizzle ORM**: Type-safe database operations.

### Cloud Storage
- **Google Cloud Storage**: For file storage.

### UI and Styling Libraries
- **Radix UI**: Component primitives.
- **Tailwind CSS**: Utility-first CSS framework.
- **Lucide React**: Icon library.

### Development Tools
- **Vite**: Build tool and development server.
- **ESBuild**: Fast JavaScript bundler.
- **TypeScript**: For type safety.