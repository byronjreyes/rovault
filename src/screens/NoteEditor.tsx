import { useEffect, useRef, useState, useCallback } from "react";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { useEditor, EditorContent, NodeViewWrapper, ReactNodeViewRenderer } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import ImageExtension from "@tiptap/extension-image";
import Placeholder from "@tiptap/extension-placeholder";
import Underline from "@tiptap/extension-underline";
import {
  ArrowLeft,
  Bold,
  Italic,
  Underline as UnderlineIcon,
  Heading1,
  Heading2,
  List,
  ListOrdered,
  Quote,
  Code,
  Image as ImageIcon,
  Trash2,
  Check,
  Folder as FolderIcon,
  AlignLeft,
  AlignCenter,
  AlignRight,
  Eye,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/toast";
import { api, type NoteFile, type NoteFolder } from "@/lib/api";
import { cn } from "@/lib/utils";

function ResizableImageComponent({ node, updateAttributes, deleteNode, selected }: any) {
  const [isResizing, setIsResizing] = useState(false);
  const [liveDimensions, setLiveDimensions] = useState<{ width: number; height: number } | null>(null);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [alignment, setAlignment] = useState<"left" | "center" | "right">(node.attrs.alignment || "center");
  const imgRef = useRef<HTMLImageElement>(null);
  const startXRef = useRef(0);
  const startYRef = useRef(0);
  const startWidthRef = useRef(0);
  const startHeightRef = useRef(0);
  const aspectRatioRef = useRef(1);
  const activeHandleRef = useRef<string | null>(null);

  const width = node.attrs.width || "380px";

  const onMouseDownHandle = (
    e: React.MouseEvent,
    handle: "nw" | "ne" | "sw" | "se" | "w" | "e"
  ) => {
    e.preventDefault();
    e.stopPropagation();
    setIsResizing(true);
    activeHandleRef.current = handle;

    const cursorMap: Record<string, string> = {
      nw: "nwse-resize",
      se: "nwse-resize",
      ne: "nesw-resize",
      sw: "nesw-resize",
      w: "ew-resize",
      e: "ew-resize",
    };
    document.body.style.cursor = cursorMap[handle] || "default";
    document.body.style.userSelect = "none";

    startXRef.current = e.clientX;
    startYRef.current = e.clientY;

    const rect = imgRef.current?.getBoundingClientRect();
    const currentWidth = rect ? rect.width : (parseInt(width, 10) || 380);
    const currentHeight = rect ? rect.height : (currentWidth * 0.75);
    startWidthRef.current = currentWidth;
    startHeightRef.current = currentHeight;
    aspectRatioRef.current = currentWidth / (currentHeight || 1);

    const onMouseMove = (moveEvent: MouseEvent) => {
      const dx = moveEvent.clientX - startXRef.current;
      const dy = moveEvent.clientY - startYRef.current;
      const ar = aspectRatioRef.current;

      let delta = 0;

      if (handle === "se") {
        const dyProjected = dy * ar;
        delta = Math.abs(dx) > Math.abs(dyProjected) ? dx : dyProjected;
      } else if (handle === "sw") {
        const dyProjected = dy * ar;
        delta = Math.abs(-dx) > Math.abs(dyProjected) ? -dx : dyProjected;
      } else if (handle === "ne") {
        const dyProjected = -dy * ar;
        delta = Math.abs(dx) > Math.abs(dyProjected) ? dx : dyProjected;
      } else if (handle === "nw") {
        const dyProjected = -dy * ar;
        delta = Math.abs(-dx) > Math.abs(dyProjected) ? -dx : dyProjected;
      } else if (handle === "e") {
        delta = dx;
      } else if (handle === "w") {
        delta = -dx;
      }

      const rawWidth = startWidthRef.current + delta;
      const containerWidth = imgRef.current?.closest(".tiptap")?.clientWidth || 900;
      const clamped = Math.max(100, Math.min(containerWidth, Math.round(rawWidth)));

      if (imgRef.current) {
        imgRef.current.style.width = `${clamped}px`;
        setLiveDimensions({ width: clamped, height: Math.round(clamped / ar) });
      }
    };

    const onMouseUp = () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      setIsResizing(false);
      setLiveDimensions(null);
      activeHandleRef.current = null;
      if (imgRef.current) {
        const finalWidth = `${imgRef.current.offsetWidth}px`;
        updateAttributes({ width: finalWidth });
      }
    };

    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
  };

  const alignStyles = {
    left: "justify-start text-left",
    center: "justify-center text-center mx-auto",
    right: "justify-end text-right ml-auto",
  };

  return (
    <NodeViewWrapper className={cn("relative my-4 flex w-full select-none", alignStyles[alignment])}>
      <div
        className={cn(
          "group/image-box relative inline-block rounded-none transition-all",
          (selected || isResizing) && "outline outline-2 outline-primary outline-offset-0"
        )}
      >
        <img
          ref={imgRef}
          src={node.attrs.src}
          alt={node.attrs.alt || "Note picture"}
          style={{ width: width, maxWidth: "100%", height: "auto" }}
          className="rounded-none block object-contain cursor-pointer"
        />

        {/* Live Size Pill while Resizing */}
        {isResizing && liveDimensions && (
          <div className="absolute -bottom-8 left-1/2 -translate-x-1/2 z-40 rounded bg-black/80 px-2.5 py-0.5 font-mono text-[11px] text-white shadow-md pointer-events-none whitespace-nowrap">
            {liveDimensions.width} × {liveDimensions.height} px
          </div>
        )}

        {/* Floating Bubble Toolbar on Selected (hidden during resize) */}
        {selected && !isResizing && (
          <div className="absolute -top-11 left-1/2 -translate-x-1/2 z-30 flex items-center gap-1 rounded-xl border border-border/80 bg-popover/95 px-2 py-1 shadow-2xl backdrop-blur-md text-popover-foreground animate-in fade-in-0 zoom-in-95">
            <button
              type="button"
              onClick={() => {
                setAlignment("left");
                updateAttributes({ alignment: "left" });
              }}
              className={cn(
                "p-1.5 rounded-lg hover:bg-accent hover:text-accent-foreground transition-colors",
                alignment === "left" && "bg-accent text-accent-foreground font-bold"
              )}
              title="Align Left"
            >
              <AlignLeft className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={() => {
                setAlignment("center");
                updateAttributes({ alignment: "center" });
              }}
              className={cn(
                "p-1.5 rounded-lg hover:bg-accent hover:text-accent-foreground transition-colors",
                alignment === "center" && "bg-accent text-accent-foreground font-bold"
              )}
              title="Align Center"
            >
              <AlignCenter className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={() => {
                setAlignment("right");
                updateAttributes({ alignment: "right" });
              }}
              className={cn(
                "p-1.5 rounded-lg hover:bg-accent hover:text-accent-foreground transition-colors",
                alignment === "right" && "bg-accent text-accent-foreground font-bold"
              )}
              title="Align Right"
            >
              <AlignRight className="h-3.5 w-3.5" />
            </button>
            <div className="h-4 w-px bg-border/80 mx-0.5" />
            <button
              type="button"
              onClick={() => setLightboxOpen(true)}
              className="p-1.5 rounded-lg hover:bg-accent hover:text-accent-foreground transition-colors"
              title="View full picture"
            >
              <Eye className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={() => deleteNode()}
              className="p-1.5 rounded-lg hover:bg-destructive/15 text-muted-foreground hover:text-destructive transition-colors"
              title="Delete picture"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        )}

        {/* 6 Resize Handles: 4 corners + 2 sides, square white with dark border, non-rounded */}
        {(selected || isResizing) && (
          <>
            {/* Top-Left */}
            <div
              onMouseDown={(e) => onMouseDownHandle(e, "nw")}
              className="absolute -top-1.5 -left-1.5 h-3.5 w-3.5 rounded-none border border-black/90 bg-white shadow-sm cursor-nwse-resize z-30 hover:scale-110 transition-transform before:absolute before:-inset-2 before:content-['']"
              title="Drag corner to resize"
            />
            {/* Top-Right */}
            <div
              onMouseDown={(e) => onMouseDownHandle(e, "ne")}
              className="absolute -top-1.5 -right-1.5 h-3.5 w-3.5 rounded-none border border-black/90 bg-white shadow-sm cursor-nesw-resize z-30 hover:scale-110 transition-transform before:absolute before:-inset-2 before:content-['']"
              title="Drag corner to resize"
            />
            {/* Bottom-Left */}
            <div
              onMouseDown={(e) => onMouseDownHandle(e, "sw")}
              className="absolute -bottom-1.5 -left-1.5 h-3.5 w-3.5 rounded-none border border-black/90 bg-white shadow-sm cursor-nesw-resize z-30 hover:scale-110 transition-transform before:absolute before:-inset-2 before:content-['']"
              title="Drag corner to resize"
            />
            {/* Bottom-Right */}
            <div
              onMouseDown={(e) => onMouseDownHandle(e, "se")}
              className="absolute -bottom-1.5 -right-1.5 h-3.5 w-3.5 rounded-none border border-black/90 bg-white shadow-sm cursor-nwse-resize z-30 hover:scale-110 transition-transform before:absolute before:-inset-2 before:content-['']"
              title="Drag corner to resize"
            />
            {/* Middle-Left */}
            <div
              onMouseDown={(e) => onMouseDownHandle(e, "w")}
              className="absolute top-1/2 -left-1.5 -translate-y-1/2 h-3.5 w-3.5 rounded-none border border-black/90 bg-white shadow-sm cursor-ew-resize z-30 hover:scale-110 transition-transform before:absolute before:-inset-2 before:content-['']"
              title="Drag side to resize width"
            />
            {/* Middle-Right */}
            <div
              onMouseDown={(e) => onMouseDownHandle(e, "e")}
              className="absolute top-1/2 -right-1.5 -translate-y-1/2 h-3.5 w-3.5 rounded-none border border-black/90 bg-white shadow-sm cursor-ew-resize z-30 hover:scale-110 transition-transform before:absolute before:-inset-2 before:content-['']"
              title="Drag side to resize width"
            />
          </>
        )}
      </div>

      {/* Lightbox Modal */}
      {lightboxOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-md p-4 animate-in fade-in-0"
          onClick={() => setLightboxOpen(false)}
        >
          <div className="relative max-h-[90vh] max-w-[90vw]" onClick={(e) => e.stopPropagation()}>
            <img
              src={node.attrs.src}
              alt={node.attrs.alt}
              className="max-h-[85vh] max-w-[85vw] rounded-none object-contain shadow-2xl"
            />
            <button
              type="button"
              onClick={() => setLightboxOpen(false)}
              className="absolute -top-3 -right-3 flex h-8 w-8 items-center justify-center rounded-full bg-white/20 text-white hover:bg-white/30 backdrop-blur-md transition-colors"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}
    </NodeViewWrapper>
  );
}

const ResizableImageExtension = ImageExtension.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      width: {
        default: "340px",
        renderHTML: (attributes) => ({
          width: attributes.width,
          style: attributes.width ? `width: ${attributes.width}; max-width: 100%;` : undefined,
        }),
      },
      alignment: {
        default: "center",
        renderHTML: (attributes) => ({
          "data-alignment": attributes.alignment,
        }),
      },
    };
  },
  addNodeView() {
    return ReactNodeViewRenderer(ResizableImageComponent);
  },
});

interface NoteEditorProps {
  note: NoteFile;
  folders: NoteFolder[];
  onBack: () => void;
  onSave: (saved: NoteFile) => void;
  onDelete: (id: string) => void;
}

export function NoteEditor({ note, folders, onBack, onSave, onDelete }: NoteEditorProps) {
  const toast = useToast();
  const [title, setTitle] = useState(note.title || "Untitled Note");
  const [folderId, setFolderId] = useState<string | null>(note.folder_id || null);
  const [isSaving, setIsSaving] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const saveTimeoutRef = useRef<number | null>(null);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: {
          levels: [1, 2, 3],
        },
      }),
      Underline,
      ResizableImageExtension.configure({
        allowBase64: true,
        inline: true,
      }),
      Placeholder.configure({
        placeholder: "Start typing your secure note or document here…",
      }),
    ],
    content: note.content || "",
    editorProps: {
      attributes: {
        class: "focus:outline-none focus:ring-0 border-0 outline-none",
      },
      handlePaste: (view, event) => {
        const items = event.clipboardData?.items;
        if (items) {
          for (let i = 0; i < items.length; i++) {
            if (items[i].type.startsWith("image/")) {
              const file = items[i].getAsFile();
              if (file) {
                const reader = new FileReader();
                reader.onload = (e) => {
                  const base64 = e.target?.result as string;
                  if (base64) {
                    view.dispatch(
                      view.state.tr.replaceSelectionWith(
                        view.state.schema.nodes.image.create({
                          src: base64,
                          alt: "pasted image",
                        })
                      )
                    );
                    setTimeout(() => performSave(), 200);
                  }
                };
                reader.readAsDataURL(file);
                return true;
              }
            }
          }
        }
        return false;
      },
      handleDrop: (view, event) => {
        const files = event.dataTransfer?.files;
        if (files && files.length > 0 && files[0].type.startsWith("image/")) {
          event.preventDefault();
          const reader = new FileReader();
          reader.onload = (e) => {
            const base64 = e.target?.result as string;
            if (base64) {
              view.dispatch(
                view.state.tr.replaceSelectionWith(
                  view.state.schema.nodes.image.create({
                    src: base64,
                    alt: files[0].name,
                  })
                )
              );
              setTimeout(() => performSave(), 200);
            }
          };
          reader.readAsDataURL(files[0]);
          return true;
        }
        return false;
      },
    },
    onUpdate: ({ editor }) => {
      triggerAutoSave(editor.getHTML());
    },
  });

  const performSave = useCallback(
    async (currentContent?: string, currentTitle?: string, currentFolderId?: string | null) => {
      const contentToSave = currentContent !== undefined ? currentContent : editor?.getHTML() || "";
      const titleToSave = currentTitle !== undefined ? currentTitle : title;
      const folderToSave = currentFolderId !== undefined ? currentFolderId : folderId;

      setIsSaving(true);
      try {
        const payload: NoteFile = {
          ...note,
          title: titleToSave.trim() || "Untitled Note",
          folder_id: folderToSave,
          content: contentToSave,
        };
        const saved = await api.upsertNote(payload);
        onSave(saved);
      } catch (err) {
        toast(`Failed to save note: ${err}`, "error");
      } finally {
        setIsSaving(false);
      }
    },
    [editor, note, title, folderId, onSave, toast]
  );

  const triggerAutoSave = useCallback(
    (html: string) => {
      if (saveTimeoutRef.current) {
        window.clearTimeout(saveTimeoutRef.current);
      }
      saveTimeoutRef.current = window.setTimeout(() => {
        performSave(html);
      }, 1000);
    },
    [performSave]
  );

  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) {
        window.clearTimeout(saveTimeoutRef.current);
      }
    };
  }, []);

  const isProcessingDropRef = useRef(false);
  const lastDropTimeRef = useRef(0);
  const editorRef = useRef(editor);
  editorRef.current = editor;
  const performSaveRef = useRef(performSave);
  performSaveRef.current = performSave;

  useEffect(() => {
    let unlisten: UnlistenFn | undefined;
    let active = true;

    listen<any>("tauri://drag-drop", async (event) => {
      const now = Date.now();
      if (isProcessingDropRef.current || now - lastDropTimeRef.current < 1500) {
        return;
      }
      isProcessingDropRef.current = true;
      lastDropTimeRef.current = now;

      try {
        const payload = event.payload;
        const paths: string[] =
          payload?.paths ||
          payload?.files ||
          (Array.isArray(payload) ? payload : []);
        for (const p of paths) {
          try {
            const fileInfo = await api.readDroppedFile(p);
            if (fileInfo.mime.startsWith("image/") && editorRef.current) {
              editorRef.current.chain().focus().setImage({ src: fileInfo.data, alt: fileInfo.name }).run();
              toast(`Inserted image "${fileInfo.name}"`, "success");
              setTimeout(() => performSaveRef.current(), 200);
            }
          } catch (e) {
            console.error("Dropped file error in NoteEditor:", e);
          }
        }
      } finally {
        setTimeout(() => {
          isProcessingDropRef.current = false;
        }, 600);
      }
    }).then((fn) => {
      if (!active) {
        fn();
      } else {
        unlisten = fn;
      }
    });

    return () => {
      active = false;
      if (unlisten) unlisten();
    };
  }, []);

  const handleTitleChange = (newTitle: string) => {
    setTitle(newTitle);
    if (saveTimeoutRef.current) {
      window.clearTimeout(saveTimeoutRef.current);
    }
    saveTimeoutRef.current = window.setTimeout(() => {
      performSave(undefined, newTitle);
    }, 1000);
  };

  const handleFolderChange = (newFolderId: string | null) => {
    setFolderId(newFolderId);
    performSave(undefined, undefined, newFolderId);
  };

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      toast("Please select a valid image file", "error");
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      toast("Image size must be less than 5MB", "error");
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const base64 = event.target?.result as string;
      if (base64 && editor) {
        editor.chain().focus().setImage({ src: base64 }).run();
        toast("Image inserted into document", "success");
        setTimeout(() => performSave(), 200);
      }
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  };

  const currentFolder = folders.find((f) => f.id === folderId);

  return (
    <div className="flex h-full flex-col overflow-hidden bg-background">
      {/* Top Header Bar */}
      <div className="flex items-center justify-between gap-4 border-b border-border/80 bg-card/40 px-5 py-3 backdrop-blur-md">
        <div className="flex items-center gap-3 min-w-0 flex-1 mr-2">
          <Button
            variant="ghost"
            size="icon"
            onClick={onBack}
            className="rounded-xl shrink-0 text-muted-foreground hover:text-foreground h-9 w-9"
            title="Back to Notes"
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>

          <div className="flex-1 min-w-0 max-w-xl">
            <Input
              value={title}
              onChange={(e) => handleTitleChange(e.target.value)}
              placeholder="Note title…"
              className="h-9 font-bold text-base bg-card/50 border border-border/60 hover:border-border focus:border-primary/80 focus:bg-background rounded-xl px-3 transition-colors shadow-xs"
            />
          </div>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          <div className="relative flex items-center">
            <select
              value={folderId || ""}
              onChange={(e) => handleFolderChange(e.target.value ? e.target.value : null)}
              className="h-9 rounded-xl border border-border/80 bg-card/80 px-3 text-xs text-muted-foreground hover:text-foreground hover:border-border focus:outline-none cursor-pointer transition-colors shadow-xs"
            >
              <option value="">No Folder (Root)</option>
              {folders.map((f) => (
                <option key={f.id} value={f.id}>
                  📁 {f.name}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-1.5 text-xs text-muted-foreground px-1">
            {isSaving ? (
              <span className="text-amber-500 animate-pulse font-medium">Saving…</span>
            ) : (
              <span className="flex items-center gap-1 text-emerald-500 font-medium">
                <Check className="h-3.5 w-3.5" />
                Saved
              </span>
            )}
          </div>

          <Button
            variant="ghost"
            size="icon"
            onClick={() => {
              if (confirm("Are you sure you want to delete this note?")) {
                onDelete(note.id);
              }
            }}
            className="rounded-xl h-9 w-9 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
            title="Delete Note"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Editor Toolbar */}
      {editor && (
        <div className="flex flex-wrap items-center gap-1 border-b border-border/60 bg-muted/20 px-5 py-1.5">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => editor.chain().focus().toggleBold().run()}
            className={cn(
              "h-8 w-8 rounded-lg",
              editor.isActive("bold") ? "bg-accent text-foreground font-bold" : "text-muted-foreground"
            )}
            title="Bold"
          >
            <Bold className="h-3.5 w-3.5" />
          </Button>

          <Button
            variant="ghost"
            size="icon"
            onClick={() => editor.chain().focus().toggleItalic().run()}
            className={cn(
              "h-8 w-8 rounded-lg",
              editor.isActive("italic") ? "bg-accent text-foreground italic" : "text-muted-foreground"
            )}
            title="Italic"
          >
            <Italic className="h-3.5 w-3.5" />
          </Button>

          <Button
            variant="ghost"
            size="icon"
            onClick={() => editor.chain().focus().toggleUnderline().run()}
            className={cn(
              "h-8 w-8 rounded-lg",
              editor.isActive("underline") ? "bg-accent text-foreground underline" : "text-muted-foreground"
            )}
            title="Underline"
          >
            <UnderlineIcon className="h-3.5 w-3.5" />
          </Button>

          <div className="h-4 w-px bg-border/80 mx-1" />

          <Button
            variant="ghost"
            size="icon"
            onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
            className={cn(
              "h-8 w-8 rounded-lg",
              editor.isActive("heading", { level: 1 }) ? "bg-accent text-foreground font-bold" : "text-muted-foreground"
            )}
            title="Heading 1"
          >
            <Heading1 className="h-3.5 w-3.5" />
          </Button>

          <Button
            variant="ghost"
            size="icon"
            onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
            className={cn(
              "h-8 w-8 rounded-lg",
              editor.isActive("heading", { level: 2 }) ? "bg-accent text-foreground font-bold" : "text-muted-foreground"
            )}
            title="Heading 2"
          >
            <Heading2 className="h-3.5 w-3.5" />
          </Button>

          <div className="h-4 w-px bg-border/80 mx-1" />

          <Button
            variant="ghost"
            size="icon"
            onClick={() => editor.chain().focus().toggleBulletList().run()}
            className={cn(
              "h-8 w-8 rounded-lg",
              editor.isActive("bulletList") ? "bg-accent text-foreground" : "text-muted-foreground"
            )}
            title="Bullet List"
          >
            <List className="h-3.5 w-3.5" />
          </Button>

          <Button
            variant="ghost"
            size="icon"
            onClick={() => editor.chain().focus().toggleOrderedList().run()}
            className={cn(
              "h-8 w-8 rounded-lg",
              editor.isActive("orderedList") ? "bg-accent text-foreground" : "text-muted-foreground"
            )}
            title="Numbered List"
          >
            <ListOrdered className="h-3.5 w-3.5" />
          </Button>

          <Button
            variant="ghost"
            size="icon"
            onClick={() => editor.chain().focus().toggleBlockquote().run()}
            className={cn(
              "h-8 w-8 rounded-lg",
              editor.isActive("blockquote") ? "bg-accent text-foreground" : "text-muted-foreground"
            )}
            title="Quote"
          >
            <Quote className="h-3.5 w-3.5" />
          </Button>

          <Button
            variant="ghost"
            size="icon"
            onClick={() => editor.chain().focus().toggleCodeBlock().run()}
            className={cn(
              "h-8 w-8 rounded-lg",
              editor.isActive("codeBlock") ? "bg-accent text-foreground" : "text-muted-foreground"
            )}
            title="Code Block"
          >
            <Code className="h-3.5 w-3.5" />
          </Button>

          <div className="h-4 w-px bg-border/80 mx-1" />

          <Button
            variant="ghost"
            size="sm"
            onClick={() => fileInputRef.current?.click()}
            className="h-8 px-2.5 rounded-lg text-muted-foreground hover:text-foreground gap-1.5 text-xs font-medium"
            title="Insert Picture"
          >
            <ImageIcon className="h-3.5 w-3.5 text-orange-500" />
            <span>Insert Picture</span>
          </Button>

          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleImageSelect}
          />
        </div>
      )}

      {/* Editor Content Area */}
      <div className="flex-1 overflow-y-auto px-8 py-6">
        <div className="mx-auto max-w-4xl space-y-3">
          {currentFolder && (
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground pb-2 border-b border-border/40">
              <FolderIcon className="h-3.5 w-3.5 text-amber-500" />
              <span>In Folder:</span>
              <span className="font-semibold text-foreground">{currentFolder.name}</span>
            </div>
          )}
          <EditorContent editor={editor} />
        </div>
      </div>
    </div>
  );
}
