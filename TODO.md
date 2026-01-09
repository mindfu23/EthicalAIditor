# Future Development

- [ ] Implement user signup / subscription flow
- [ ] Add "forgot password" loop
- [ ] Integrate payment processing for subscriptions

---

## Cold Start Indicator Component (To Be Integrated)

A cold start indicator component has been created to show users when the LLM API is waking up from idle state. This needs to be integrated into the chat/main component.

### Files Created:
- `src/components/ColdStartIndicator.tsx` - Main component
- `src/components/ColdStartIndicator.css` - Styling (optional)

### Integration Steps:
1. Import the component in your chat/API-calling component:
   ```typescript
   import { ColdStartIndicator } from './ColdStartIndicator';
   ```

2. Add a loading state if not already present:
   ```typescript
   const [isGenerating, setIsGenerating] = useState(false);
   ```

3. Wrap API calls with the loading state:
   ```typescript
   const handleSubmit = async () => {
     setIsGenerating(true);
     try {
       // ...API call...
     } finally {
       setIsGenerating(false);
     }
   };
   ```

4. Add the component to your JSX:
   ```tsx
   <ColdStartIndicator isLoading={isGenerating} />
   ```

### To Disable:
Edit `src/components/ColdStartIndicator.tsx` line 4:
```typescript
const COLD_START_ENABLED = false;
```

### Notes:
- Only shows after 3 seconds of loading (to avoid showing for warm requests)
- Expected cold start time: 30-60 seconds
- Shows progress bar and elapsed/remaining time estimates
- Supports dark mode
