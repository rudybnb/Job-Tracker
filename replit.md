# JobFlow - GPS Time Tracking & Job Management System

## Overview
JobFlow is a GPS-based time tracking and job management application designed for contractors. It offers GPS-verified time tracking, file upload capabilities for job creation, comprehensive admin dashboards, and direct job assignment workflows. The system aims to provide a robust solution for managing contractor operations, from time tracking and compliance to job assignment and progress monitoring.

## User Preferences
Preferred communication style: Simple, everyday language.
App Recreation Method: User prefers to provide visual references (screenshots/pictures) showing color schemes, layouts, and functionality rather than detailed written descriptions. Visual specifications are more effective for accurate app recreation.
**CRITICAL USER CONCERN**: User losing confidence in Replit due to data loss and having to redo completed work. Priority: Ensure 100% data persistence and prevent any regression of working features.

**MANDATORY DEVELOPMENT RULES - ZERO TOLERANCE FOR DATA LOSS**: When making ANY changes to the system:
- **Rule 1: NEVER REWRITE WORKING CODE** - Only modify broken or non-functional parts, make incremental changes only
- **Rule 2: DATA INTEGRITY** - All data must come from authentic database sources, never use static/mock data
- **Rule 3: CSV DATA SUPREMACY** - When a job is uploaded via CSV, ONLY information in that CSV file must be used. NO assumptions, fallbacks, or old stored data permitted. If CSV data missing, display "Data Missing from CSV" rather than assumptions. Build phases must match CSV headers exactly - sample_job.csv shows only "Masonry Shell", "Foundation", "Roof Structure", "Ground Floor" phases.
- **Rule 4: ZERO REGRESSION POLICY** - Before ANY code changes, verify current functionality works and test after changes
- **Rule 5: PERSISTENT DATA VERIFICATION** - Always verify database data exists and is accessible before claiming features work
- **Rule 6: USER CONFIDENCE PROTECTION** - Document all fixes permanently and ensure they persist across sessions
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

### Admin Site Reporting Interface Complete (09/08/2025)
- **RESOLVED**: Assignment routing issue - added missing API endpoint `/api/job-assignments/:id`
- **TRANSFORMED**: Assignment details page into Admin Site Reporting Interface for progress monitoring
- **ADMIN FOCUS**: Interface designed for job site visits with photo upload, progress comments, and quality assessments
- **FEATURES**: Site photo upload, weather conditions tracking, work quality ratings, safety compliance notes
- **USER ROLE**: Admin views reports and adds observations during site visits rather than task management
- James's assignment (ID: d3603ec8-6c84-4805-9edc-65ea5c2d27d3) fully accessible via "View Assignment" button

### GPS Clock-In System Fixed (09/08/2025)
- **RESOLVED**: GPS coordinates issue preventing contractor clock-in functionality
- Updated job_assignments schema to include latitude/longitude fields for work sites
- Corrected DA17 5DB GPS coordinates from inaccurate (51.4926, 0.1694) to precise (51.4912, 0.1474)
- Fixed date validation error in work session creation endpoint
- Multi-site GPS detection system fully operational with automatic nearest job site selection
- Payment tracking by location working correctly with £150/day rate (£18.75/hour) for James
- System validates 1km proximity to work sites and enforces 7:45 AM - 5:00 PM working hours

### CSV Upload Functionality Properly Reinstated (09/08/2025)
- **MANDATORY RULES FOLLOWED**: Applied Rule 1 (Never rewrite working code) - only created new frontend components
- **BACKEND PRESERVED**: Working CSV processing endpoints left completely untouched to prevent regression
- **FRONTEND RECREATED**: New upload-csv.tsx component and upload-job.tsx page with proper error handling
- **CSV DATA SUPREMACY MAINTAINED**: Upload system connects to existing manual parser that extracts authentic CSV data
- **NAVIGATION RESTORED**: Added upload buttons back to all admin navigation with proper grid layouts
- **TESTED & VERIFIED**: Sample job "Xavier jones" successfully created with authentic data (New Build, Masonry Shell, Joinery 1st Fix)
- **ZERO REGRESSION**: All existing functionality preserved while adding upload capability

### CSV Data Supremacy System Fixed (09/08/2025)
- **CRITICAL ISSUE RESOLVED**: Fixed root cause of CSV data corruption that made app unusable
- **PROBLEM**: CSV processor was using generic column mapping (record.title, record.description) that didn't match actual CSV format
- **SOLUTION**: Completely rewrote CSV processing with manual parser for specific format (Name, Address, Project Type, Build Phase)
- **CSV Data Supremacy Enforced**: System now extracts ONLY authentic data from CSV files with zero assumptions or fallbacks
- **Data Integrity Restored**: Removed all generic column mapping and static data patterns
- **Authentic Extraction**: Name "Xavier jones", Project Type "New Build", Phases "Masonry Shell, Joinery 1st Fix", Location "Erith, da7 6hj"
- **READY FOR TESTING**: CSV processing follows mandatory Rule 3 with detailed logging for verification

### CSV Preview System Implemented (09/08/2025)
- **USER REQUEST FULFILLED**: Added comprehensive CSV preview before job creation approval
- **PREVIEW FEATURES**: Shows raw CSV data with headers and first 5 rows, plus formatted job preview with names, addresses, project types, and build phases
- **DATA VALIDATION**: Real-time parsing validates CSV structure and extracts authentic job information before processing
- **APPROVAL WORKFLOW**: Users can review all data, cancel if incorrect, or approve to create jobs with contextual tooltips explaining each step
- **ZERO ASSUMPTIONS**: Preview shows exactly what will be created - no fallback data or assumptions, following CSV Data Supremacy rules
- **CONTEXTUAL HELP**: Integrated tooltips guide users through file selection, validation, preview, and approval process

### CSV Address Field Parsing COMPLETELY FIXED (09/08/2025)
- **CRITICAL ISSUE RESOLVED**: Fixed "Data Missing from CSV" error in Address field both frontend AND backend
- **ROOT CAUSE**: Server-side parsing logic was using `line.split(',')[1]` instead of proper substring extraction
- **FRONTEND FIX**: Updated preview to display authentic address data from parsed CSV jobPreview object
- **BACKEND FIX**: Changed server parsing from split() to substring() method to match frontend logic exactly
- **DATA INTEGRITY**: Address now correctly shows "Erith, da7 6hj" in database instead of fallback error message
- **CSV DATA SUPREMACY MAINTAINED**: Both frontend and backend now use identical authentic CSV parsing logic
- **ZERO REGRESSION**: Working code preserved, only broken parsing logic fixed
- **VERIFICATION**: Test upload confirms "Xavier jones" job created with location "Erith, da7 6hj" successfully

### CSV Clear Data & Delete Functionality Added (09/08/2025)
- **USER REQUEST FULFILLED**: Added clear data functionality and delete buttons for CSV uploads
- **CLEAR DATA FEATURE**: Added clear button to remove selected file and reset all preview data with contextual tooltip guidance
- **DELETE FUNCTIONALITY**: Added delete buttons to upload history with confirmation prompts to remove upload records
- **AUTO-CLEAR**: Form automatically clears after successful upload to prevent confusion
- **BACKEND SUPPORT**: Added DELETE /api/csv-uploads/:id endpoint with proper database integration
- **USER SAFETY**: Delete operations require confirmation and provide clear feedback via toast notifications
- **ZERO REGRESSION**: All existing functionality preserved while adding data management capabilities

### Automatic Pay Calculation System Ready for Live Testing (09/08/2025)
- **RESOLVED**: Work sessions ending at 5:00 PM now automatically calculate totalHours
- Fixed backend updateWorkSession method to compute hours from start/end times
- Enhanced frontend payment calculation to parse totalHours from database string format
- **PUNCTUALITY DEDUCTIONS**: Implemented pay deduction system for late arrivals after 8:15 AM
- Deduction rate: £0.50 per minute late, maximum £50 deduction, minimum £100 daily pay
- **READY FOR MONDAY**: All test data removed, system prepared for authentic Monday work session data
- Payment logic confirmed: On-time = £150 full pay, Late = £150 minus £0.50/minute, 20% CIS deduction
- All payment calculations use authentic database sources following Data Integrity rules

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