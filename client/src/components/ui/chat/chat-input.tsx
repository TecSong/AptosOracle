import * as React from "react";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

interface ChatInputProps
    extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {}

const ChatInput = React.forwardRef<HTMLTextAreaElement, ChatInputProps>(
    ({ className, ...props }, ref) => {
        const textareaRef = React.useRef<HTMLTextAreaElement | null>(null);
        
        // Merge forwardRef with internal ref
        React.useImperativeHandle(ref, () => textareaRef.current as HTMLTextAreaElement);
        
        // Function to automatically adjust height
        const adjustHeight = React.useCallback(() => {
            const textarea = textareaRef.current;
            if (!textarea) return;
            
            // Reset height for proper calculation
            textarea.style.height = 'auto';
            
            // Calculate content height (scrollHeight is the actual content height)
            const contentHeight = textarea.scrollHeight;
            
            // Set line height and maximum number of lines
            const lineHeight = 24; // Estimated line height
            const maxLines = 10; // Changed from 5 to 10 lines
            const maxHeight = lineHeight * maxLines;
            
            // Set new height, but not exceeding maximum height
            textarea.style.height = `${Math.min(contentHeight, maxHeight)}px`;
        }, []);
        
        // Adjust height when content changes
        React.useEffect(() => {
            const textarea = textareaRef.current;
            if (!textarea) return;
            
            // Initial adjustment
            adjustHeight();
            
            // Listen for input events
            const handleInput = () => adjustHeight();
            textarea.addEventListener('input', handleInput);
            
            // Clean up event listeners
            return () => {
                textarea.removeEventListener('input', handleInput);
            };
        }, [adjustHeight]);

        return (
            <Textarea
                autoComplete="off"
                ref={textareaRef}
                name="message"
                className={cn(
                    "min-h-20 max-h-[240px] px-4 py-3 bg-background text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 w-full rounded-md flex items-center resize-none overflow-y-auto",
                    className
                )}
                {...props}
            />
        );
    }
);
ChatInput.displayName = "ChatInput";

export { ChatInput };
