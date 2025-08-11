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

### Recent Technical Achievements (August 10, 2025)
- **Admin Site Reporting System**: Comprehensive admin inspection interface with photo uploads, quality ratings, weather conditions, safety notes, and detailed assessments. Contractors focus on work, not paperwork.
- **Database Schema Enhancement**: Added `contractor_reports` and `admin_inspections` tables with full API endpoints supporting both reporting tiers
- **Assignment Details Page**: Enhanced with contractor Quick Report functionality and admin inspection forms, maintaining "here to work not paperwork" philosophy for contractors
- **Field Mapping Resolution**: Fixed assignment details display issues (hbxlJob vs title, workLocation vs location) ensuring proper data flow from job assignments
- **Reporting API Integration**: Created complete CRUD operations for both contractor reports and admin inspections with proper error handling and validation
- **Progressive Inspection System**: Implemented automatic admin inspection notifications at 50% and 100% job completion milestones, integrated into admin dashboard "Site Inspections Required" section (formerly "Overdue Projects")
- **Inspection Dashboard Integration**: Replaced the basic "Overdue Projects" tab with intelligent inspection notifications showing pending milestone inspections, with direct links to assignment details and one-click completion marking

### Recent Fixes (August 11, 2025 - 6:00 PM)
- **✅ EARL JOHNSON ADMIN ROLE CORRECTED**: Fixed Earl Johnson's role from contractor to admin
  - Removed Earl from contractor_applications table 
  - Deleted Earl's contractor work sessions and job assignments
  - Earl now logs in with earl.johnson / EarlAdmin2025! for admin access only
  - System maintains proper separation: Earl = Admin, Dalwayne = Contractor
- **✅ CONTRACTOR DATA SEPARATION**: Fixed API username mapping for proper data isolation
  - Earl's contractor data removed from system
  - Dalwayne remains as authentic contractor with £18.75/hour, 30% CIS deduction
  - Each role now has completely separate authentication and data access

### CRITICAL DATA PROTECTION UPDATE (August 11, 2025 - 9:35 PM)
- **✅ TASK PROGRESS DATABASE PERSISTENCE**: Implemented comprehensive TaskProgressManager to prevent data loss on logout:
  - Created TaskProgressManager class with dual-layer persistence (localStorage + database)
  - Database schema updated with `completed` column in task_progress table
  - Smart backup system automatically saves task progress to database
  - Database restore functionality when localStorage is cleared
  - Maintained CSV data supremacy - only authentic CSV task data is used
  - Enhanced task completion handler with robust database persistence
  - **ZERO DATA LOSS GUARANTEE**: Task progress now survives logout/login cycles
- **✅ IMPROVED TASK MANAGEMENT ARCHITECTURE**: Enhanced task progress system while preserving existing functionality:
  - TaskProgressManager handles both immediate localStorage and background database sync
  - Smart upsert functionality creates or updates task progress records
  - Authentic CSV data extraction preserved with no assumptions or fallbacks
  - Database backup occurs automatically on every task completion
  - Comprehensive error handling with graceful fallback to localStorage

### Previous Updates (August 10, 2025 - 5:30 PM)
- **✅ COMPLETE JAMES DATA ELIMINATION**: Completely removed all "James Wilson" test data from entire system:
  - Deleted James work sessions and admin settings from database
  - Updated all hardcoded "James Wilson" references to "Dalwayne Diedericks"
  - Fixed fallback login to use Dalwayne instead of James
  - Cleared localStorage to force fresh authentication
- **✅ CONTRACTOR PRIVACY ENHANCED**: Removed personal details from all contractor dropdowns:
  - Eliminated email addresses, contractor IDs, and role descriptions
  - Simplified dropdowns to show only contractor names for privacy
  - Updated GPS dashboard, task progress, job assignments, and earnings pages
- **✅ AVATAR CORRECTIONS**: Fixed all avatar initials across system:
  - Changed hardcoded "JC" to dynamic "DD" for Dalwayne Diedericks
  - Updated earnings dashboard avatar to show correct initials
- **✅ AUTHENTIC CIS STATUS DISPLAY**: Corrected CIS information to show authentic data:
  - Changed from "CIS Registered (20%)" to "Not CIS Registered (30%)"
  - Updated visual indicators with orange warning for non-CIS status
  - System now uses contractor's actual form submission data for CIS calculations

### Critical Data Integrity Fixes (August 10, 2025 - 5:15 PM)
- **✅ JAMES DATA REMOVED**: Completely eliminated all "James" test data from the system - deleted work sessions, admin settings, and references
- **✅ AUTHENTIC CONTRACTOR ENFORCEMENT**: System now defaults to Dalwayne Diedericks instead of James Wilson in all components
- **✅ DYNAMIC CONTRACTOR DATA**: GPS dashboard and salary pages now pull contractor info from localStorage and authentic database records
- **✅ CIS RATE CORRECTED**: Fixed CIS deduction to use Dalwayne's actual form data (30% - Not CIS Registered) instead of hardcoded 20%
- **✅ API ENDPOINT ADDED**: Created /api/contractor-application/:username endpoint to fetch authentic contractor application data
- **✅ LIVE DATA VALIDATION**: Verified Dalwayne's authentic data in database: £18.75/hour, Not CIS Registered (30% deduction), dalwayne.diedericks@gmail.com

### Final Assignment Fix (August 10, 2025 - 6:00 PM)
- **✅ ASSIGNMENT DISPLAY FIXED**: Resolved job assignment visibility issues:
  - Fixed database query to handle partial name matching (Dalwayne → Dalwayne Diedericks)
  - Updated task progress and jobs pages to use dynamic contractor names from localStorage
  - Eliminated remaining hardcoded James references throughout system

### Reporting System Correction (August 10, 2025 - 6:45 PM)  
- **✅ CONTRACTOR INTERFACE SIMPLIFIED**: Removed contractor reporting interface to maintain "here to work not paperwork" philosophy
- **✅ ADMIN-ONLY REPORTING**: Confirmed reporting system is admin-only with comprehensive site inspection capabilities
- **✅ NAVIGATION RESTORED**: Reverted contractor navigation to 3-tab system (Dashboard, Jobs, More) as originally designed

### Earnings Calculation Fix (August 11, 2025 - 4:45 PM)
- **✅ PAY CALCULATION CORRECTED**: Fixed earnings display to use authentic database rates:
  - Hourly rate: Uses actual £18.75 from contractor application adminPayRate field
  - Daily rate: Calculated as £18.75 × 8 = £150 (not hardcoded)
  - Time display: Corrected to 24-hour format (07:44-17:00) using proper locale settings
  - Hours worked: Capped at 8.0 maximum for daily rate calculation per company policy
- **✅ CIS CALCULATION FIXED**: Corrected tax deductions to match HMRC standards:
  - Gross: £150 daily rate for 8+ hours worked
  - CIS deduction: £45 (30% for non-CIS registered contractors)
  - Net payment: £105 (matches official HMRC CIS calculator)
- **✅ LATE PENALTY LOGIC**: Verified punctuality system works correctly:
  - 7:44 AM start time is before 8:15 AM cutoff = no penalty applied
  - System correctly identifies early arrival and applies full daily rate
  
### Multi-Contractor Architecture Notes
The system is now fully prepared for new contractors:
- **Dynamic Authentication**: All pages now pull contractor data from localStorage instead of hardcoded values
- **Flexible Name Matching**: Database queries handle both full names and first names for assignment lookups
- **Scalable Assignment System**: Job assignments work for any contractor with proper authentication flow
- **Complete Data Separation**: Each contractor's work sessions, assignments, and reports are properly isolated

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