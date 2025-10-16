# Workforce Management Platform - 3-Site System

## Overview

A comprehensive workforce management platform designed for managing operations across 3 care sites (Kent, London, Essex). The system handles staff scheduling (rota) with conflict detection, attendance tracking with manual clock-in/out and approval workflows, room monitoring via QR code scanning with time-expiring tokens, payroll processing with overtime calculation (1.5x after 8 hours per shift) and detailed breakdowns, and HR query management. Built with a focus on data clarity and efficient workflows for both administrative and worker interfaces.

**Status**: Fully operational - all core features implemented and tested

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture
- **Framework**: React with TypeScript using Vite as the build tool
- **UI Framework**: Shadcn/ui component library built on Radix UI primitives
- **Styling**: Tailwind CSS with custom design system following productivity/enterprise patterns
- **State Management**: TanStack Query (React Query) for server state management
- **Routing**: Wouter for lightweight client-side routing
- **Design Approach**: Design system optimized for data-heavy enterprise applications with dual interfaces:
  - Admin/Manager: Desktop-optimized with sidebar navigation
  - Worker: Mobile-first with bottom navigation

### Backend Architecture
- **Runtime**: Node.js with Express.js framework
- **Language**: TypeScript with ES modules
- **API Design**: RESTful API following OpenAPI 3.0 patterns
- **Authentication**: Replit Auth integration using OpenID Connect (OIDC)
- **Session Management**: PostgreSQL-backed sessions using connect-pg-simple
- **Validation**: Zod schemas for request/response validation
- **Development**: Hot module replacement via Vite in development mode

### Database Layer
- **ORM**: Drizzle ORM for type-safe database operations
- **Database**: PostgreSQL via Neon serverless (WebSocket-based connection pooling)
- **Schema Management**: Drizzle Kit for migrations and schema management
- **Connection Strategy**: Serverless-optimized connection pooling with WebSocket support

### Core Data Models
The system is built around these primary entities:
- **Sites**: 3 distinct locations with color-coding (purple/teal/orange) for visual identification
- **Users**: Staff members (firstName, lastName) with roles (admin, site_manager, worker) and site assignments. Uses varchar UUID primary keys for OIDC compatibility
- **Shifts**: Scheduled work periods with automatic conflict detection for overlapping times
- **Attendance**: Clock-in/out records with approval workflow (pending/approved/rejected states)
- **Rooms**: Physical spaces with time-expiring QR codes (10-minute validity, refreshable)
- **Room Scans**: Visit logs with confidence scoring based on QR token freshness
- **Payroll Runs**: Pay period processing with draft/processing/finalized states
- **Payslips**: Detailed breakdowns with line items for regular hours, overtime (1.5x), and deductions
- **Queries**: Support ticket system for pay/HR/scheduling questions with message threads

### Security Architecture
- **Authentication Flow**: Replit Auth with OpenID Connect
- **Authorization**: Role-based access control (RBAC) with middleware guards
- **Session Security**: HTTP-only secure cookies with 1-week TTL
- **QR Token Security**: Time-expiring signed tokens for room access verification
- **Data Isolation**: Site-scoped queries for multi-tenant data separation

### Key Architectural Decisions

**1. Dual Interface Pattern**
- **Problem**: Different user roles (admin vs worker) have vastly different needs and contexts
- **Solution**: Separate UI architectures - desktop sidebar for admins, mobile-first bottom navigation for workers
- **Rationale**: Admins need information density and multi-tasking, workers need quick mobile access to essential functions

**2. Replit Auth Integration**
- **Problem**: Need secure authentication without managing user credentials
- **Solution**: Leverage Replit's OpenID Connect provider with passport.js strategy
- **Rationale**: Reduces security burden, provides seamless integration with Replit ecosystem
- **Trade-offs**: Vendor lock-in to Replit platform, but gains managed authentication infrastructure

**3. PostgreSQL with Drizzle ORM**
- **Problem**: Need type-safe database operations with good developer experience
- **Solution**: Drizzle ORM with Neon serverless PostgreSQL
- **Rationale**: Type safety from database to frontend, serverless scaling, WebSocket-based pooling for edge deployment
- **Alternatives Considered**: Prisma (more abstractions), raw SQL (less type safety)

**4. Time-Expiring QR Codes for Room Scans**
- **Problem**: Need to verify room visits while preventing QR code replay attacks
- **Solution**: Rotating QR codes with expiry timestamps and confidence scoring
- **Rationale**: Security through time-bound tokens, confidence degradation alerts staff to refresh codes
- **Implementation**: QR codes expire and must be refreshed, with confidence scores based on remaining validity

**5. Payroll Line-Item Architecture**
- **Problem**: Staff need transparency on all pay components (regular hours, overtime, deductions with reasons)
- **Solution**: Granular line-item breakdown in payslips with source shift references
- **Rationale**: Reduces HR queries by providing self-service transparency
- **Benefits**: Audit trail, dispute resolution, compliance reporting

**6. Query/Ticket System with SLA Workflow**
- **Problem**: Staff have questions about pay, schedules, HR matters
- **Solution**: Integrated ticket system with category routing and status tracking
- **Rationale**: Centralizes support requests, provides accountability and resolution tracking

**7. Role-Based Automatic Routing**
- **Problem**: Different user roles need different interfaces, but all login through same auth flow
- **Solution**: Automatic redirect on home page (/) based on user role - workers→/worker, admins/managers→dashboard
- **Rationale**: Provides appropriate interface automatically without manual navigation
- **Implementation**: RoleRedirect component fetches user role from /api/auth/user and routes accordingly

**8. Charcoal Dark Theme by Default**
- **Problem**: Need consistent, professional appearance for workforce management
- **Solution**: Dark charcoal theme (HSL 0 0% 12%) with purple primary, white text, gold/brown accents - default on all interfaces
- **Rationale**: Reduces eye strain for long work sessions, professional appearance, high contrast (7:1) for accessibility
- **Implementation**: ThemeProvider defaults to "dark" mode, users can toggle to light if preferred

## External Dependencies

### Third-Party Services
- **Replit Auth**: OpenID Connect authentication provider
- **Neon Database**: Serverless PostgreSQL hosting with WebSocket support

### UI Component Libraries
- **Radix UI**: Headless accessible component primitives (@radix-ui/react-*)
- **Shadcn/ui**: Pre-built component library built on Radix UI
- **Lucide React**: Icon library for consistent iconography

### Development Tools
- **Vite**: Build tool and development server
- **Replit Vite Plugins**: Development banner, cartographer, runtime error overlay
- **Drizzle Kit**: Database schema management and migrations

### Data & Utilities
- **TanStack Query**: Server state management and caching
- **React Hook Form**: Form state management with Zod validation
- **date-fns**: Date manipulation and formatting
- **wouter**: Lightweight routing library

### Styling & Theming
- **Tailwind CSS**: Utility-first CSS framework
- **class-variance-authority**: Component variant management
- **tailwind-merge**: Intelligent class merging

### Session & Storage
- **connect-pg-simple**: PostgreSQL session store for Express
- **express-session**: Session middleware

### Implemented Features (October 2025)
All core features are fully operational:
1. **Site Management**: CRUD operations for managing 3 sites with color identification
2. **Staff Directory**: User management with role-based access control (admin/site_manager/worker)
3. **Shift Scheduling**: Rota system with automatic conflict detection for overlapping shifts
4. **Attendance Tracking**: Manual clock-in/out with approval workflows and duration calculation
5. **Room Monitoring**: QR code generation with 10-minute expiry and scan logging with confidence scores
6. **Payroll Processing**: Automated payroll runs with overtime calculation (1.5x after 8hrs), deductions, and detailed breakdowns
7. **Query System**: Staff support ticket system with message threads and status tracking
8. **Analytics Dashboard**: Reports showing hours summary, cost analysis, attendance metrics, and site performance
9. **Mobile Worker Views**: Dedicated mobile-optimized interface for workers (home, clock, pay, scan, profile)

### Future Integration Points
- **Payroll Export**: CSV generation for Sage/Xero/BrightPay integration
- **Biometric SDK**: Fingerprint device integration for kiosk clock-in
- **Geofencing**: Location verification for clock-in/out events  
- **SMS/Email**: Notification service for alerts and reminders
- **Advanced Reporting**: Custom report builder with date ranges and filters

### Testing Notes
- Database uses firstName/lastName columns (not fullName)
- OIDC testing: Auth middleware allows testing without expires_at validation
- All SelectItems must have non-empty value props (Radix UI requirement)
- Object Storage is pre-configured for QR code assets