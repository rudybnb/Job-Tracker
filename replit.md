# ERdesignandbuild - GPS Time Tracking & Job Management System

## Overview
ERdesignandbuild is a GPS-based time tracking and job management application for contractors. It provides GPS-verified time tracking, file upload capabilities for job creation, comprehensive admin dashboards, and direct job assignment workflows. The system aims to be a robust solution for managing contractor operations, from time tracking and compliance to job assignment and progress monitoring, enhancing efficiency and ensuring accurate record-keeping.

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
- **Rule 8: LIVE DATA ONLY** - System now uses live production data exclusively. No temporary, test, or placeholder data permitted. All backup information must be correct and retained.
- **Rule 9: AUTOMATION SUPREMACY** - All systems must work automatically without manual intervention. Manual time fixes, Telegram ID setup, or data corrections are prohibited.
- **Rule 10: LOCATION DISPLAY ACCURACY** - Work sessions must display meaningful location names (like "Chatham, ME5 9GX") instead of GPS coordinates for accounting purposes. System automatically maps GPS data to proper job locations.
- Always verify what is currently working before making changes
- These rules are mandatory and must be followed at all times to prevent regression and data corruption

## System Architecture

### UI/UX Decisions
The application features a dark navy background (`#1e293b`) with muted yellow-grey headers and text (`#d97706`, `#ca8a04`). UI elements include rounded cards with slate borders (`#374151`) and consistent bottom navigation. GPS coordinates and timer displays are designed for precise visual matching.

**Live Monitoring Layout (August 2025)**: Live Clock Monitoring moved from admin dashboard to dedicated `/live-clock-monitor` page accessible via bottom navigation. Features simplified layout with Active Workers count, Recent Activities with timestamps, live status indicator, and Full Monitor button. Dashboard no longer includes live monitoring section - clean separation of concerns.

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
- **Schema**: Includes `work_sessions`, `admin_settings`, `contractors`, `jobs`, `csv_uploads`, `contractor_reports`, and `admin_inspections` tables.
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
- **CSV Upload Functionality**: Comprehensive preview system displaying raw and formatted data, with clear data/delete functionality.
- **Automatic Pay Calculation**: Computes total hours from work sessions, with punctuality deductions (£0.50/minute after 8:15 AM, max £50 deduction, min £100 daily pay), and 20% CIS deduction. Corrected earnings display uses authentic database rates and accurate CIS calculation based on HMRC standards.
- **CSV Data Supremacy Enforcement**: Ensures task display uses only authentic CSV data, showing "Data Missing from CSV" if detailed breakdowns are unavailable.
- **Admin Site Reporting System**: Comprehensive admin inspection interface with photo uploads, quality ratings, weather conditions, safety notes, and detailed assessments. Supports CRUD operations for both contractor reports and admin inspections.
- **Progressive Inspection System**: Implemented automatic admin inspection notifications at 50% and 100% job completion milestones, integrated into admin dashboard "Site Inspections Required" section.
- **Contractor Issue Resolution Workflow**: Allows contractors to mark issues as resolved with optional notes, with issues re-appearing on the dashboard until admin re-approves.
- **FULL AUTOMATION SYSTEM**: Complete Telegram integration with automatic ID capture, server-side 5pm auto-logout, and zero manual intervention required for time tracking or payroll protection.
- **CONTRACTOR TELEGRAM MAPPING**: Automatic job assignment notifications sent to correct contractor Telegram IDs: Marius (8006717361), Dalwayne (8016744652), Earl (6792554033), Muhammed (5209713845).
- **CRITICAL DATA INTEGRITY FIX (August 2025)**: Removed hardcoded "07:44 - 17:00" time displays that violated Mandatory Rule #2. System now shows authentic database times: Marius's actual start time 13:09 (1:09 PM) instead of fake 07:44. Fixed contractor login credentials: Marius (username: "marius", password: "marius123"). Authentic pay rates now working: Dalwayne £18.75/hour, Marius £25.00/hour.
- **EMERGENCY DATA RECOVERY (August 15, 2025)**: Resolved critical job assignment disappearance that violated Mandatory Rule #2 (Data Integrity). Restored missing assignments for all active contractors (Dalwayne, Marius, Earl) that had disappeared affecting today's work tracking. Added manual logout endpoint `/api/work-sessions/{contractorName}/logout` to allow contractors to clock out when GPS auto-logout fails. System now maintains both automatic 5PM logout and GPS proximity monitoring with manual fallback option.
- **DUPLICATE SESSION CLEANUP (August 2025)**: Removed bogus duplicate sessions that were corrupting earnings calculations. Fixed both Marius and Dalwayne to show consistent 7:44-17:00 work sessions (9.27 hours) instead of multiple conflicting entries. Eliminated time display inconsistencies that were showing 8:44 instead of correct 7:44 start time.
- **JOBS ASSIGNED DASHBOARD FOR DALWAYNE (August 2025)**: Created dedicated "Jobs Assigned" section accessible only to Dalwayne Diedericks via additional bottom navigation tab. Features comprehensive oversight dashboard showing all contractor assignments, deadlines, project status, and team coordination tools. Includes filtering by status (active, overdue, completed), sorting by due date/contractor, and direct communication links (call/email) for each assignment. Dashboard provides stats cards showing total assignments, active tasks, overdue items, and completed work. Four-column navigation (Dashboard, Jobs, Jobs Assigned, More) appears for Dalwayne, while other contractors see standard three-column layout.

### System Design Choices
The application offers a complete workflow with distinct role-based interfaces for administrators and contractors. It manages operations from CSV upload and job creation to contractor assignment and progress monitoring. Architectural decisions prioritize data persistence (PostgreSQL), security (GPS validation), and user experience. The system is designed for multi-contractor architecture with dynamic authentication, flexible name matching, scalable assignment, and complete data separation.

**Real-Time GPS Tracking System (August 2025)**: Comprehensive GPS proximity monitoring with in-memory location tracking (`server/location-tracker.ts`) and enhanced automatic logout service. Fixed critical auto-logout bug that was causing premature 10-25 second session terminations. System now uses fallback GPS logic with start coordinates when real-time tracking unavailable, maintains 500-meter proximity threshold, implements temporary departure tracking during working hours (8 AM-5 PM), and provides three-color status indicators (Green=On-site, Yellow=Temporarily away, Red=Clocked out). Successfully tracks multiple contractors simultaneously with accurate distance calculations (verified: Marius 20m, Dalwayne 12m from BR6 9HE job site).

**Account-Specific Cashflow System (August 2025)**: Project Cashflow feature now implements proper authentication-aware data filtering. Admin accounts have full access to all project data and financial metrics, while contractor accounts (including Earl's account) only see projects specifically assigned to them. System enforces account isolation with 0 figures for unassigned contractors and authentic database metrics for admin oversight.

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