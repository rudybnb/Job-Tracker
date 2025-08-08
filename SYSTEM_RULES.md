# MANDATORY SYSTEM RULES - NEVER VIOLATE

## RULE 1: NEVER TOUCH WORKING CODE
- If a feature is working correctly, NEVER modify its code
- Only modify code that is broken or needs new functionality
- Before ANY change, verify what is currently working
- Document working features and mark them as PROTECTED

## RULE 2: INCREMENTAL CHANGES ONLY
- Make only the minimum changes required
- Test each change before proceeding
- Never rewrite entire files or systems
- Preserve all existing functionality

## RULE 3: DATA INTEGRITY ENFORCEMENT
- ALL data must come from database sources
- NO static, mock, or placeholder data allowed
- Validate data source before displaying
- Clear only broken/incorrect data, never working data

## RULE 4: CHANGE ISOLATION
- Changes to one feature must NOT affect other features
- Use targeted fixes, not system-wide rewrites
- Maintain separation between components
- Test that existing features still work after changes

## RULE 5: ROLLBACK PROTECTION
- Never remove working code without backup
- Document what was working before changes
- Provide rollback path for any change
- Keep working versions intact

## CURRENT WORKING FEATURES (PROTECTED):
✅ Job assignment creation and storage in database
✅ Contractor assignment retrieval by name
✅ GPS dashboard assignment display
✅ Database connections and queries
✅ Express server routing
✅ React component rendering
✅ Telegram bot token configuration

## BROKEN FEATURES (CAN BE MODIFIED):
❌ Static task data in task-progress.tsx
❌ Persistent localStorage with wrong data
❌ Any hardcoded masonry/landscaping data

## CHANGE LOG:
- 2025-08-08: Established mandatory system rules
- Working features marked as PROTECTED
- Only broken features can be modified