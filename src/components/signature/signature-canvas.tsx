
"use client";

import React, {
  useRef,
  useEffect,
  forwardRef,
  useImperativeHandle,
  useCallback,
  useState,
} from "react";
import Draggable from "react-draggable";
import { cn } from "@/lib/utils";

interface SignatureCanvasProps {
  tool: "pen" | "text";
  color: string;
  font: string;
  size: number;
  className?: string;
}

export interface SignatureCanvasRef {
  clear: () => void;
  toDataURL: () => string;
  isEmpty: () => boolean;
}

interface TextElement {
  id: number;
  text: string;
  x: number;
  y: number;
  isEditing: boolean;
  ref: React.RefObject<HTMLDivElement>;
}

const SignatureCanvas = forwardRef<SignatureCanvasRef, SignatureCanvasProps>(
  ({ tool, color, font, size, className }, ref) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const contextRef = useRef<CanvasRenderingContext2D | null>(null);
    const isDrawingRef = useRef(false);
    
    // Only one text element is allowed now
    const [textElement, setTextElement] = useState<TextElement | null>(null);

    const getFontFamily = (fontClass: string) => {
        if (fontClass === 'font-unifraktur-maguntia') return 'UnifrakturMaguntia';
        // A more robust way to derive font family name from tailwind class
        const name = fontClass.replace('font-', '');
        return name.split('-').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
    }

    useImperativeHandle(ref, () => ({
      clear,
      toDataURL: () => {
        const canvas = canvasRef.current;
        const context = contextRef.current;
        if (!canvas || !context) return "";
        
        const tempCanvas = document.createElement('canvas');
        const tempCtx = tempCanvas.getContext('2d');
        if(!tempCtx) return "";

        tempCanvas.width = canvas.width;
        tempCanvas.height = canvas.height;
        
        // Draw the signature from the main canvas
        tempCtx.drawImage(canvas, 0, 0);

        // If there is text, draw it on top
        if (textElement && textElement.text) {
          const fontSize = 12 + size * 2;
          const fontFamily = getFontFamily(font);

          tempCtx.font = `${fontSize}px "${fontFamily}"`;
          tempCtx.fillStyle = color;
          tempCtx.textBaseline = "top";
          
          const dpr = window.devicePixelRatio || 1;
          tempCtx.fillText(textElement.text, textElement.x / dpr, textElement.y / dpr);
        }
        
        return tempCanvas.toDataURL("image/png");
      },
      isEmpty: () => {
         const canvas = canvasRef.current;
         if (!canvas) return true;

         // Check if canvas is blank
         const blankCanvas = document.createElement('canvas');
         blankCanvas.width = canvas.width;
         blankCanvas.height = canvas.height;
         const isCanvasBlank = canvas.toDataURL() === blankCanvas.toDataURL();
         
         const hasText = !!textElement && textElement.text.trim() !== "";
         return isCanvasBlank && !hasText;
      },
    }));

    const clear = useCallback(() => {
      const canvas = canvasRef.current;
      const context = contextRef.current;
      if (!canvas || !context) return;
      context.clearRect(0, 0, canvas.width, canvas.height);
      setTextElement(null);
    }, []);

    const setupCanvasContext = useCallback(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const parent = canvas.parentElement;
        if (!parent) return;

        const dpr = window.devicePixelRatio || 1;
        const rect = parent.getBoundingClientRect();
        
        const currentImage = contextRef.current?.getImageData(0,0, canvas.width, canvas.height);

        canvas.width = rect.width * dpr;
        canvas.height = rect.height * dpr;
        
        const context = canvas.getContext("2d", { willReadFrequently: true });
        if(!context) return;

        context.scale(dpr, dpr);
        contextRef.current = context;
        context.lineCap = "round";
        context.lineJoin = "round";
        
        if (currentImage) {
            // If the canvas was already drawn on, redraw it. This handles resizing.
            const tempCanvas = document.createElement('canvas');
            const tempCtx = tempCanvas.getContext('2d');
            if(tempCtx) {
                tempCanvas.width = currentImage.width;
                tempCanvas.height = currentImage.height;
                tempCtx.putImageData(currentImage, 0, 0);
                context.drawImage(tempCanvas, 0, 0, rect.width, rect.height);
            }
        }
    }, []);

    useEffect(() => {
      setupCanvasContext();
      window.addEventListener('resize', setupCanvasContext);
      return () => window.removeEventListener('resize', setupCanvasContext);
    }, [setupCanvasContext]);

    useEffect(() => {
      const context = contextRef.current;
      if (!context) return;
      context.strokeStyle = color;
      context.lineWidth = size;
    }, [color, size]);
    
    const getCoords = (e: MouseEvent | TouchEvent) => {
      const canvas = canvasRef.current;
      if (!canvas) return { x: 0, y: 0 };
      const rect = canvas.getBoundingClientRect();
      const clientX = e instanceof MouseEvent ? e.clientX : e.touches[0].clientX;
      const clientY = e instanceof MouseEvent ? e.clientY : e.touches[0].clientY;
      return { x: clientX - rect.left, y: clientY - rect.top };
    };

    const startDrawing = (e: React.MouseEvent | React.TouchEvent) => {
      if (tool !== 'pen') return;
      const context = contextRef.current;
      if (!context) return;
      const { x, y } = getCoords(e.nativeEvent);
      context.beginPath();
      context.moveTo(x, y);
      isDrawingRef.current = true;
    };

    const draw = (e: React.MouseEvent | React.TouchEvent) => {
      if (!isDrawingRef.current || tool !== 'pen') return;
      const context = contextRef.current;
      if (!context) return;
      const { x, y } = getCoords(e.nativeEvent);
      context.lineTo(x, y);
      context.stroke();
    };

    const stopDrawing = () => {
      const context = contextRef.current;
      if (!isDrawingRef.current || !context) return;
      context.closePath();
      isDrawingRef.current = false;
    };

    const handleCanvasClick = (e: React.MouseEvent) => {
        if (tool !== 'text') return;
        
        // If there's no text element, create one.
        if (!textElement) {
            const { x, y } = getCoords(e.nativeEvent);
            const dpr = window.devicePixelRatio || 1;
            const newTextElement: TextElement = {
                id: Date.now(),
                text: "Your text here",
                x: x * dpr,
                y: y * dpr,
                isEditing: true,
                ref: React.createRef()
            };
            setTextElement(newTextElement);
        } else {
            // If text exists, make it editable.
             setTextElement(prev => prev ? ({...prev, isEditing: true}) : null);
        }
    };

    const handleTextChange = (newText: string) => {
        setTextElement(prev => prev ? ({ ...prev, text: newText }) : null);
    };

    const handleDragStop = (data: { x: number; y: number }) => {
        setTextElement(prev => prev ? ({ ...prev, x: data.x, y: data.y }) : null);
    };

    return (
      <div 
        className={cn("w-full h-full relative overflow-hidden", tool === 'pen' ? 'cursor-crosshair' : 'cursor-text', className)}
        onClick={handleCanvasClick}
      >
          <canvas
            ref={canvasRef}
            className="absolute top-0 left-0 w-full h-full touch-none"
            onMouseDown={startDrawing}
            onMouseUp={stopDrawing}
            onMouseOut={stopDrawing}
            onMouseMove={draw}
            onTouchStart={startDrawing}
            onTouchEnd={stopDrawing}
            onTouchCancel={stopDrawing}
            onTouchMove={draw}
          />

          {textElement && (
             <Draggable
                position={{ x: textElement.x, y: textElement.y }}
                onStop={(e, data) => handleDragStop(data)}
                nodeRef={textElement.ref}
                cancel="input" 
             >
                <div 
                    ref={textElement.ref}
                    className="absolute"
                    style={{ pointerEvents: 'auto', zIndex: 10, cursor: 'move' }}
                    onClick={(e) => e.stopPropagation()} 
                >
                    {textElement.isEditing ? (
                        <input
                            type="text"
                            value={textElement.text}
                            onChange={e => handleTextChange(e.target.value)}
                            autoFocus
                            onBlur={() => setTextElement(prev => prev ? ({...prev, isEditing: false}) : null)}
                            onKeyDown={(e) => { if(e.key === 'Enter') setTextElement(prev => prev ? ({...prev, isEditing: false}) : null) }}
                            className={cn("bg-transparent outline-none border-dashed border-gray-400 border", font)}
                            style={{ color: color, fontSize: `${12 + size * 2}px`, width: `${(textElement.text.length + 1) * (12 + size)}px` }}
                        />
                    ) : (
                        <span
                            className={cn("whitespace-nowrap select-none", font)}
                            style={{ color: color, fontSize: `${12 + size * 2}px` }}
                             onClick={() => setTextElement(prev => prev ? ({...prev, isEditing: true}) : null)}
                        >
                            {textElement.text}
                        </span>
                    )}
                </div>
             </Draggable>
          )}
      </div>
    );
  }
);

SignatureCanvas.displayName = "SignatureCanvas";

export default SignatureCanvas;

    
