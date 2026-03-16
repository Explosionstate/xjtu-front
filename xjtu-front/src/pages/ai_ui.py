import sys
from PyQt5.QtWidgets import (QApplication, QMainWindow, QWidget, QVBoxLayout, QHBoxLayout,
                             QScrollArea, QLabel, QLineEdit, QDoubleSpinBox, QComboBox,
                             QPushButton, QFrame, QGroupBox)
from PyQt5.QtCore import Qt, QSize
from PyQt5.QtGui import QFont


class SearchParamOptimizationPanel(QWidget):
    """
    搜索参数调优面板 - 支持完整的滑动和文字清晰显示
    """

    def __init__(self):
        super().__init__()
        self.init_ui()

    def init_ui(self):
        """初始化用户界面"""
        main_layout = QVBoxLayout()
        main_layout.setContentsMargins(15, 15, 15, 15)
        main_layout.setSpacing(12)

        # 标题
        title = QLabel("检索参数调优")
        title.setObjectName("SearchParamTitle")
        font = QFont()
        font.setPointSize(16)
        font.setBold(True)
        title.setFont(font)
        main_layout.addWidget(title)

        # 分隔线
        separator = QFrame()
        separator.setFrameShape(QFrame.HLine)
        separator.setStyleSheet("color: rgba(0, 229, 255, 0.2);")
        main_layout.addWidget(separator)

        # 创建滚动区域以支持内容溢出时的滑动
        scroll_area = QScrollArea()
        scroll_area.setObjectName("ParamScrollArea")
        scroll_area.setWidgetResizable(True)
        scroll_area.setStyleSheet("""
            QScrollArea {
                border: none;
                background-color: transparent;
            }
            QScrollBar:vertical {
                border: none;
                background: rgba(255, 255, 255, 0.03);
                width: 10px;
                border-radius: 5px;
            }
            QScrollBar::handle:vertical {
                background: rgba(255, 255, 255, 0.25);
                border-radius: 5px;
                min-height: 20px;
            }
            QScrollBar::handle:vertical:hover {
                background: rgba(255, 255, 255, 0.35);
            }
        """)

        # 内容容器
        content_widget = QWidget()
        content_layout = QVBoxLayout()
        content_layout.setSpacing(12)

        # 描述文本
        description = QLabel("按会话调整参数回传输，便于评估检索效果")
        description.setObjectName("ParamDescription")
        description.setWordWrap(True)
        description.setStyleSheet("""
            QLabel {
                color: #9CA3AF;
                font-size: 13px;
                font-weight: 500;
                padding: 10px;
                background-color: rgba(0, 229, 255, 0.05);
                border: 1px solid rgba(0, 229, 255, 0.2);
                border-radius: 6px;
            }
        """)
        content_layout.addWidget(description)

        # 参数1：回召替换
        param1_layout = QHBoxLayout()
        param1_label = QLabel("召回替换")
        param1_label.setStyleSheet("color: #E0E7FF; font-weight: 600; font-size: 14px; min-width: 100px;")
        param1_input = QLineEdit()
        param1_input.setPlaceholderText("8")
        param1_input.setStyleSheet(self.get_input_style())
        param1_layout.addWidget(param1_label)
        param1_layout.addWidget(param1_input)
        param1_layout.addStretch()
        content_layout.addLayout(param1_layout)

        # 参数2：分国值
        param2_layout = QHBoxLayout()
        param2_label = QLabel("分國值")
        param2_label.setStyleSheet("color: #E0E7FF; font-weight: 600; font-size: 14px; min-width: 100px;")
        param2_input = QDoubleSpinBox()
        param2_input.setValue(0.15)
        param2_input.setDecimals(2)
        param2_input.setStyleSheet(self.get_input_style())
        param2_layout.addWidget(param2_label)
        param2_layout.addWidget(param2_input)
        param2_layout.addStretch()
        content_layout.addLayout(param2_layout)

        # 参数3：模式
        param3_layout = QHBoxLayout()
        param3_label = QLabel("模式")
        param3_label.setStyleSheet("color: #E0E7FF; font-weight: 600; font-size: 14px; min-width: 100px;")
        param3_combo = QComboBox()
        param3_combo.addItems(["weighted", "standard", "advanced"])
        param3_combo.setStyleSheet(self.get_input_style())
        param3_layout.addWidget(param3_label)
        param3_layout.addWidget(param3_combo)
        param3_layout.addStretch()
        content_layout.addLayout(param3_layout)

        # 参数4：权重值
        param4_layout = QHBoxLayout()
        param4_label = QLabel("權重")
        param4_label.setStyleSheet("color: #E0E7FF; font-weight: 600; font-size: 14px; min-width: 100px;")
        param4_input = QLineEdit()
        param4_input.setPlaceholderText("0.9")
        param4_input.setStyleSheet(self.get_input_style())
        param4_layout.addWidget(param4_label)
        param4_layout.addWidget(param4_input)
        param4_layout.addStretch()
        content_layout.addLayout(param4_layout)

        # 附加信息
        info_label = QLabel("提示：参数值的调整会实时影响检索结果的排序和评分。")
        info_label.setWordWrap(True)
        info_label.setStyleSheet("""
            QLabel {
                color: #9CA3AF;
                font-size: 12px;
                margin-top: 10px;
                padding: 8px;
                background-color: rgba(0, 229, 255, 0.03);
                border-radius: 4px;
            }
        """)
        content_layout.addWidget(info_label)

        content_layout.addStretch()
        content_widget.setLayout(content_layout)
        scroll_area.setWidget(content_widget)

        main_layout.addWidget(scroll_area)

        # 底部按钮
        button_layout = QHBoxLayout()
        button_layout.setSpacing(10)

        reset_button = QPushButton("重置参数")
        reset_button.setStyleSheet(self.get_button_style("secondary"))
        reset_button.setMinimumHeight(40)

        apply_button = QPushButton("应用参数")
        apply_button.setStyleSheet(self.get_button_style("primary"))
        apply_button.setMinimumHeight(40)

        button_layout.addWidget(reset_button)
        button_layout.addWidget(apply_button)

        main_layout.addLayout(button_layout)

        self.setLayout(main_layout)
        self.setObjectName("SearchParamOptimization")

    @staticmethod
    def get_input_style():
        """获取输入框样式"""
        return """
            QLineEdit, QDoubleSpinBox, QComboBox {
                background-color: rgba(255, 255, 255, 0.05);
                color: #00E5FF;
                border: 1px solid rgba(0, 229, 255, 0.3);
                border-radius: 6px;
                padding: 8px 12px;
                font-size: 13px;
                font-weight: 500;
                selection-background-color: rgba(0, 229, 255, 0.4);
                min-height: 30px;
            }
            QLineEdit:focus, QDoubleSpinBox:focus, QComboBox:focus {
                border: 2px solid #00E5FF;
                background-color: rgba(0, 229, 255, 0.08);
            }
            QComboBox::drop-down {
                border: none;
                width: 20px;
                background-color: transparent;
            }
            QComboBox::down-arrow {
                image: none;
                color: #00E5FF;
            }
        """

    @staticmethod
    def get_button_style(button_type):
        """获取按钮样式"""
        if button_type == "primary":
            return """
                QPushButton {
                    background: qlineargradient(x1:0, y1:0, x2:1, y2:0, 
                        stop:0 #0072FF, stop:1 #00E5FF);
                    color: white;
                    border: none;
                    border-radius: 8px;
                    font-weight: bold;
                    font-size: 15px;
                    padding: 10px 20px;
                }
                QPushButton:hover {
                    background: qlineargradient(x1:0, y1:0, x2:1, y2:0,
                        stop:0 #005BCC, stop:1 #00B8CC);
                }
                QPushButton:pressed {
                    padding-top: 12px;
                    padding-bottom: 8px;
                    background: qlineargradient(x1:0, y1:0, x2:1, y2:0,
                        stop:0 #0047A3, stop:1 #0093A3);
                }
            """
        else:  # secondary
            return """
                QPushButton {
                    background-color: rgba(255, 255, 255, 0.05);
                    color: #00E5FF;
                    border: 1px solid rgba(0, 229, 255, 0.3);
                    border-radius: 8px;
                    font-weight: bold;
                    font-size: 15px;
                    padding: 10px 20px;
                }
                QPushButton:hover {
                    background-color: rgba(0, 229, 255, 0.1);
                    border: 1px solid rgba(0, 229, 255, 0.6);
                }
                QPushButton:pressed {
                    padding-top: 12px;
                    padding-bottom: 8px;
                    background-color: rgba(0, 229, 255, 0.18);
                }
            """


class MainWindow(QMainWindow):
    """主窗口"""

    def __init__(self):
        super().__init__()
        self.init_ui()

    def init_ui(self):
        """初始化主窗口"""
        self.setWindowTitle("AI 助手 - 检索参数调优")
        self.setGeometry(100, 100, 600, 700)

        # 设置深色主题
        self.setStyleSheet("""
            QMainWindow {
                background-color: #0A0F1C;
            }
        """)

        # 创建中央窗口
        central_widget = QWidget()
        layout = QVBoxLayout()
        layout.setContentsMargins(0, 0, 0, 0)

        # 添加参数调优面板
        panel = SearchParamOptimizationPanel()
        layout.addWidget(panel)

        central_widget.setLayout(layout)
        self.setCentralWidget(central_widget)


def main():
    app = QApplication(sys.argv)

    # 可选：加载外部样式表（如果你有改进的 QSS 文件）
    # try:
    #     with open('improved_stylesheet.qss', 'r', encoding='utf-8') as f:
    #         app.setStyleSheet(f.read())
    # except FileNotFoundError:
    #     print("样式表文件未找到，使用默认样式")

    window = MainWindow()
    window.show()
    sys.exit(app.exec_())


if __name__ == '__main__':
    main()