# JobFlow - Job Management System

## Overview

JobFlow is a full-stack job management system built for assigning and tracking jobs for contractors. The application provides a dashboard interface for managing jobs, contractors, and CSV uploads with real-time statistics and an intuitive user interface.

## User Preferences

Preferred communication style: Simple, everyday language.

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