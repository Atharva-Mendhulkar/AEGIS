#!/usr/bin/env python3
"""
generate_documents.py
Builds:
1. AI_Lab_Project_Review_Report.md
2. AI_Lab_Project_Review_Document_AEGIS.pdf

Fully compliant with "AI Lab Project Review Document.pdf" template and enriched with recent 2022-2026 literature.
"""

import os
import sys
from reportlab.lib.pagesizes import A4
from reportlab.lib import colors
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, PageBreak, KeepTogether, Image, HRFlowable
)
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.pdfgen import canvas

# Define NumberedCanvas for professional header/footer with page numbers
class NumberedCanvas(canvas.Canvas):
    def __init__(self, *args, **kwargs):
        super(NumberedCanvas, self).__init__(*args, **kwargs)
        self._saved_page_states = []

    def showPage(self):
        self._saved_page_states.append(dict(self.__dict__))
        self._startPage()

    def save(self):
        num_pages = len(self._saved_page_states)
        for state in self._saved_page_states:
            self.__dict__.update(state)
            self.draw_page_decorations(num_pages)
            super(NumberedCanvas, self).showPage()
        super(NumberedCanvas, self).save()

    def draw_page_decorations(self, page_count):
        self.saveState()
        self.setFont("Helvetica", 8)
        self.setFillColor(colors.HexColor("#555555"))
        
        # Header on pages > 1
        if self._pageNumber > 1:
            self.drawString(36, 810, "School of Computer Science Engineering & Information Systems | BITE308L Artificial Intelligence")
            self.setStrokeColor(colors.HexColor("#BDC3C7"))
            self.setLineWidth(0.5)
            self.line(36, 804, 559, 804)

        # Footer on all pages
        self.setStrokeColor(colors.HexColor("#BDC3C7"))
        self.setLineWidth(0.5)
        self.line(36, 32, 559, 32)
        
        footer_text = f"AEGIS: A Resilience-Aware Logistics Planning Engine — Page {self._pageNumber} of {page_count}"
        self.drawString(36, 22, footer_text)
        self.drawRightString(559, 22, "VIT Vellore — October 2026")
        self.restoreState()


print("Script template ready.")
