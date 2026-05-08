/**
 * Built-in skill definitions inspired by Anthropic's pre-built skills.
 * These are always available alongside user-defined skills from ~/.dragon/skills/.
 */

import type { SkillDefinition } from './types.js';

const BUILTIN_SKILLS: SkillDefinition[] = [
  {
    name: 'xlsx',
    description: 'Create, edit, and analyze Excel .xlsx spreadsheets',
    content: `## Excel (.xlsx) Skill

You can create, edit, and analyze .xlsx files using Python. Follow these guidelines:

### Reading .xlsx files
- Use \`openpyxl\` to read and analyze Excel files: \`wb = openpyxl.load_workbook(filename)\`
- Access sheets by name: \`ws = wb['Sheet1']\` or \`wb.active\`
- Iterate rows with \`ws.iter_rows()\` or access cells with \`ws['A1'].value\`
- For large files, use \`read_only=True\` mode to save memory

### Creating and editing .xlsx files
- Create a new workbook: \`wb = openpyxl.Workbook()\`
- Write to cells: \`ws['A1'] = 'value'\` or \`ws.cell(row=1, column=1, value='value')\`
- Apply formatting: set \`Font\`, \`PatternFill\`, \`Alignment\`, \`Border\` from \`openpyxl.styles\`
- Add formulas as strings: \`ws['B1'] = '=SUM(A1:A10)'\`
- Auto-fit column widths by measuring content length
- Add charts via \`openpyxl.chart\` (BarChart, LineChart, PieChart)
- Freeze panes: \`ws.freeze_panes = 'A2'\`
- Save with \`wb.save('filename.xlsx')\`

### Best practices
- Always save to the working directory with a descriptive filename
- Use headers and formatting for readability
- Validate data before writing
- Provide the user with the output file path when done
- For data analysis, prefer pandas: \`df = pd.read_excel('file.xlsx')\``,
    sourcePath: '(builtin)',
    loadedAt: new Date(),
  },
  {
    name: 'docx',
    description: 'Create, edit, and analyze Word .docx documents',
    content: `## Word (.docx) Skill

You can create, edit, and analyze .docx files using Python. Follow these guidelines:

### Reading .docx files
- Use \`python-docx\` to read documents: \`doc = Document('file.docx')\`
- Access paragraphs: \`doc.paragraphs\` — each has \`.text\` and \`.style.name\`
- Access tables: \`doc.tables\` — iterate rows and cells
- Check sections, headers, and footers via \`doc.sections\`

### Creating and editing .docx files
- Create a new document: \`doc = Document()\`
- Add headings: \`doc.add_heading('Title', level=1)\` (levels 1-9)
- Add paragraphs: \`p = doc.add_paragraph('Text')\`
- Apply formatting: \`p.runs[0].bold = True\`, \`.italic\`, \`.underline\`, \`.font.size\`, \`.font.color.rgb\`
- Add tables: \`table = doc.add_table(rows=3, cols=2)\`, set style with \`table.style = 'Light Grid Accent 1'\`
- Add page breaks: \`doc.add_page_break()\`
- Insert images: \`doc.add_picture('image.png', width=Inches(4))\`
- Save with \`doc.save('filename.docx')\`

### Best practices
- Use consistent heading hierarchy (H1 > H2 > H3)
- Apply document styles rather than manual formatting where possible
- Keep paragraphs focused — one idea per paragraph
- Save to the working directory with a descriptive filename
- Provide the user with the output file path when done`,
    sourcePath: '(builtin)',
    loadedAt: new Date(),
  },
  {
    name: 'pptx',
    description: 'Create, edit, and analyze PowerPoint .pptx presentations',
    content: `## PowerPoint (.pptx) Skill

You can create, edit, and analyze .pptx files using Python. Follow these guidelines:

### Reading .pptx files
- Use \`python-pptx\` to read presentations: \`prs = Presentation('file.pptx')\`
- Access slides: \`prs.slides\` — each slide has \`.shapes\`
- Inspect shapes: check \`.shape_type\`, \`.text\`, \`.has_table\`, etc.

### Creating presentations
- Create a new presentation: \`prs = Presentation()\`
- Choose slide layout: \`slide_layout = prs.slide_layouts[0]\` (0=title, 1=title+content, etc.)
- Add slide: \`slide = prs.slides.add_slide(slide_layout)\`
- Add text to placeholders: \`slide.shapes.title.text = 'Title'\`
- Add text boxes: \`left, top, width, height = Inches(1), Inches(2), Inches(8), Inches(2)\` then \`txBox = slide.shapes.add_textbox(left, top, width, height)\`
- Add tables, charts, images via shapes
- Apply consistent formatting: use a theme or consistent font/color scheme
- Save with \`prs.save('filename.pptx')\`

### Design guidelines
- Use a clean, professional design with consistent colors and fonts
- Limit to 5-7 bullet points per slide
- Use large, readable font sizes (≥24pt body, ≥36pt titles)
- Include visuals (charts, diagrams) to support key points
- Keep slides focused — one topic per slide
- Provide the user with the output file path when done`,
    sourcePath: '(builtin)',
    loadedAt: new Date(),
  },
  {
    name: 'pdf',
    description: 'Read, extract, and analyze PDF documents',
    content: `## PDF Skill

You can read, extract, and analyze PDF files using Python. Follow these guidelines:

### Reading and extracting PDF content
- Use \`pypdf\` for basic reading and metadata: \`reader = pypdf.PdfReader('file.pdf')\`
- Access metadata: \`reader.metadata\` (title, author, etc.)
- Get page count: \`len(reader.pages)\`
- Extract text from a page: \`page.extract_text()\`
- Use \`pdfplumber\` for better text extraction and table detection:
  \`pdf = pdfplumber.open('file.pdf')\` then \`page.extract_text()\`, \`page.extract_tables()\`

### Creating PDFs
- Use \`fpdf2\` (\`from fpdf import FPDF\`) for simple PDF generation
- Convert other formats: use \`python-docx\` + \`docx2pdf\`, or pandas \`df.to_html()\` → pdf
- For markdown to PDF, consider writing to .md first then converting
- Save to the working directory with a descriptive filename

### Image-based PDFs (scanned documents)
- If text extraction returns empty, the PDF likely contains images
- Use \`pymupdf\` (fitz) for image extraction: \`doc = fitz.open('file.pdf'); page.get_pixmap()\`
- The \`read\` tool can also view PDF pages as images for visual inspection

### Best practices
- Always try text extraction first before assuming a PDF is image-only
- For tables, prefer pdfplumber's extract_tables()
- Handle encrypted PDFs by checking \`reader.is_encrypted\`
- Provide clear summaries of extracted content to the user`,
    sourcePath: '(builtin)',
    loadedAt: new Date(),
  },
];

/** Return the built-in skill definitions (always available). */
export function getBuiltInSkills(): SkillDefinition[] {
  return BUILTIN_SKILLS;
}
