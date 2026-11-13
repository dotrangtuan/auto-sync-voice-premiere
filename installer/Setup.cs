using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.IO.Compression;
using System.Reflection;
using System.Security.Cryptography;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
using System.Windows.Forms;

[assembly: AssemblyTitle("Auto Sync Voice Setup")]
[assembly: AssemblyDescription("Cai dat Auto Sync Voice cho Adobe Premiere Pro")]
[assembly: AssemblyProduct("Auto Sync Voice")]
[assembly: AssemblyVersion("0.4.0.1")]
[assembly: AssemblyFileVersion("0.4.0.1")]

namespace AutoSyncVoiceSetup {
    public static class Payload {
        public static byte[] Read() {
            using (Stream input = typeof(Payload).Assembly.GetManifestResourceStream("AutoSyncVoice.payload.zip")) {
                if (input == null) throw new IOException("Không tìm thấy dữ liệu cài đặt.");
                using (MemoryStream output = new MemoryStream()) { input.CopyTo(output); return output.ToArray(); }
            }
        }
        public static void Extract(byte[] bytes, string folder) {
            string root = Path.GetFullPath(folder).TrimEnd(Path.DirectorySeparatorChar) + Path.DirectorySeparatorChar;
            Directory.CreateDirectory(root);
            using (ZipArchive archive = new ZipArchive(new MemoryStream(bytes), ZipArchiveMode.Read)) {
                HashSet<string> names = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
                foreach (ZipArchiveEntry entry in archive.Entries) {
                    string relative = entry.FullName.Replace('/', Path.DirectorySeparatorChar);
                    if (Path.IsPathRooted(relative) || relative.Contains(":")) throw new IOException("Đường dẫn không hợp lệ trong bộ cài.");
                    string target = Path.GetFullPath(Path.Combine(root, relative));
                    if (!target.StartsWith(root, StringComparison.OrdinalIgnoreCase) || !names.Add(target))
                        throw new IOException("Đường dẫn không hợp lệ trong bộ cài.");
                }
                foreach (ZipArchiveEntry entry in archive.Entries) {
                    string target = Path.GetFullPath(Path.Combine(root, entry.FullName.Replace('/', Path.DirectorySeparatorChar)));
                    if (entry.FullName.EndsWith("/")) { Directory.CreateDirectory(target); continue; }
                    Directory.CreateDirectory(Path.GetDirectoryName(target));
                    using (Stream source = entry.Open())
                    using (FileStream output = new FileStream(target, FileMode.CreateNew, FileAccess.Write)) { source.CopyTo(output); }
                }
            }
        }
        public static void Verify(byte[] bytes) {
            using (SHA256 hash = SHA256.Create()) {
                string actual = BitConverter.ToString(hash.ComputeHash(bytes)).Replace("-", "").ToLowerInvariant();
                if (actual != BuildInfo.PayloadHash) throw new IOException("Dữ liệu bộ cài bị hỏng. Vui lòng tải lại Setup.exe.");
            }
        }
    }

    public static class Runner {
        public static int Run(string script, Action<string> output) {
            ProcessStartInfo info = new ProcessStartInfo();
            info.FileName = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.Windows), @"System32\WindowsPowerShell\v1.0\powershell.exe");
            info.Arguments = "-NoLogo -NoProfile -NonInteractive -ExecutionPolicy Bypass -File \"" + script + "\"";
            info.WorkingDirectory = Path.GetDirectoryName(script);
            info.UseShellExecute = false;
            info.CreateNoWindow = true;
            info.WindowStyle = ProcessWindowStyle.Hidden;
            info.RedirectStandardOutput = true;
            info.RedirectStandardError = true;
            info.StandardOutputEncoding = Encoding.UTF8;
            info.StandardErrorEncoding = Encoding.UTF8;
            info.EnvironmentVariables["PYTHONIOENCODING"] = "utf-8";
            info.EnvironmentVariables["PYTHONUNBUFFERED"] = "1";
            info.EnvironmentVariables["PIP_DISABLE_PIP_VERSION_CHECK"] = "1";
            info.EnvironmentVariables["PIP_PROGRESS_BAR"] = "off";
            using (Process process = new Process()) {
                process.StartInfo = info;
                process.OutputDataReceived += delegate(object sender, DataReceivedEventArgs e) { if (e.Data != null) output(e.Data); };
                process.ErrorDataReceived += delegate(object sender, DataReceivedEventArgs e) { if (e.Data != null) output(e.Data); };
                if (!process.Start()) throw new IOException("Không mở được tiến trình cài đặt.");
                process.BeginOutputReadLine();
                process.BeginErrorReadLine();
                process.WaitForExit();
                return process.ExitCode;
            }
        }
    }

    public class SetupForm : Form {
        readonly Color Accent = Color.FromArgb(77, 62, 204);
        readonly Label status = new Label();
        readonly Label summary = new Label();
        readonly ProgressBar progress = new ProgressBar();
        readonly Button install = new Button();
        readonly Button close = new Button();
        readonly LinkLabel details = new LinkLabel();
        readonly LinkLabel logLink = new LinkLabel();
        readonly TextBox log = new TextBox();
        readonly object logLock = new object();
        bool busy;
        bool gpuWarning;
        string logFile;
        StreamWriter writer;

        Label TextAt(string text, int x, int y, int width, int height, float size, bool bold) {
            Label label = new Label { Text = text, Location = new Point(x,y), Size = new Size(width,height),
                Font = new Font("Segoe UI", size, bold ? FontStyle.Bold : FontStyle.Regular), ForeColor = Color.FromArgb(38,41,51) };
            Controls.Add(label); return label;
        }
        public SetupForm() {
            Text = "Auto Sync Voice · Cài đặt";
            ClientSize = new Size(680,490);
            Font = new Font("Segoe UI", 10F);
            BackColor = Color.White;
            FormBorderStyle = FormBorderStyle.FixedSingle;
            MaximizeBox = false;
            StartPosition = FormStartPosition.CenterScreen;
            AutoScaleMode = AutoScaleMode.Dpi;
            Panel stripe = new Panel { BackColor = Accent, Location = new Point(0,0), Size = new Size(680,7) };
            Controls.Add(stripe);
            TextAt("AUTO SYNC VOICE  /  PREMIERE PRO",30,28,620,24,9F,true).ForeColor = Accent;
            TextAt("Cài đặt trong một cửa sổ",30,63,620,42,24F,true);
            TextAt("Python, Whisper và thư viện GPU được chuẩn bị tự động.",32,116,614,28,11F,false);
            TextAt("01   Lưu công việc và đóng Premiere trước khi bắt đầu.\r\n02   Kết nối Internet để tải các thành phần còn thiếu.\r\n03   Chờ hoàn tất, rồi mở Auto Sync Voice trong Premiere.",32,165,614,87,11F,false);
            summary.Location = new Point(32,265); summary.Size = new Size(614,52);
            summary.ForeColor = Color.FromArgb(102,107,120);
            summary.Text = "Lần đầu có thể tải khoảng 1–2 GB thư viện. Model Whisper tải riêng khi bạn phân tích voice lần đầu. Driver NVIDIA cần có sẵn để dùng GPU.";
            Controls.Add(summary);
            status.Location = new Point(32,329); status.Size = new Size(614,28); status.Text = "Sẵn sàng cài đặt"; status.Font = new Font(Font, FontStyle.Bold); Controls.Add(status);
            progress.Location = new Point(32,365); progress.Size = new Size(614,7); progress.Style = ProgressBarStyle.Continuous; Controls.Add(progress);
            details.Text = "Xem chi tiết"; details.LinkColor = Accent; details.Location = new Point(32,398); details.Size = new Size(115,26);
            details.LinkClicked += delegate { ShowDetails(!log.Visible); }; Controls.Add(details);
            logLink.Text = "Mở nhật ký"; logLink.LinkColor = Accent; logLink.Location = new Point(152,398); logLink.Size = new Size(110,26); logLink.Visible = false;
            logLink.LinkClicked += delegate { if (File.Exists(logFile)) Process.Start(new ProcessStartInfo("notepad.exe", "\"" + logFile + "\"") { UseShellExecute = true }); }; Controls.Add(logLink);
            close.Text = "Đóng"; close.Location = new Point(382,397); close.Size = new Size(98,42); close.FlatStyle = FlatStyle.Flat;
            close.FlatAppearance.BorderColor = Color.FromArgb(220,222,230); close.Click += delegate { Close(); }; Controls.Add(close);
            install.Text = "Cài đặt"; install.Location = new Point(494,397); install.Size = new Size(152,42);
            install.BackColor = Accent; install.ForeColor = Color.White; install.FlatStyle = FlatStyle.Flat; install.FlatAppearance.BorderSize = 0;
            install.Click += async delegate { await Install(); }; Controls.Add(install);
            TextAt("0.4.0 beta  ·  Windows 64-bit  ·  Cài cho tài khoản hiện tại",32,456,614,22,9F,false).ForeColor = Color.Gray;
            log.Multiline = true; log.ReadOnly = true; log.ScrollBars = ScrollBars.Both; log.WordWrap = false;
            log.Font = new Font("Consolas",9F); log.Location = new Point(32,502); log.Size = new Size(614,212); log.Visible = false; Controls.Add(log);
            FormClosing += delegate(object sender, FormClosingEventArgs e) {
                if (busy) { e.Cancel = true; status.Text = "Đang cài đặt. Vui lòng chờ hoàn tất trước khi đóng."; }
            };
        }
        void ShowDetails(bool show) { log.Visible = show; ClientSize = new Size(680, show ? 738 : 490); details.Text = show ? "Ẩn chi tiết" : "Xem chi tiết"; }
        void Line(string text) {
            lock (logLock) { if (writer != null) { writer.WriteLine(text); writer.Flush(); } }
            if (!IsDisposed && IsHandleCreated) BeginInvoke((Action)delegate {
                if (log.TextLength > 150000) log.Clear();
                log.AppendText(text + Environment.NewLine);
                if (text.StartsWith("[1/4]")) status.Text = "Bước 1/4 · Chuẩn bị Python";
                else if (text.StartsWith("[2/4]")) status.Text = "Bước 2/4 · Chuẩn bị thư viện Whisper";
                else if (text.StartsWith("[GPU]")) status.Text = "Đang chuẩn bị và kiểm tra thư viện GPU";
                else if (text.StartsWith("[3/4]")) status.Text = "Bước 3/4 · Cài panel vào Premiere";
                else if (text.StartsWith("[4/4]")) status.Text = "Bước 4/4 · Hoàn tất thiết lập";
                if (text.StartsWith("CANH BAO: GPU")) gpuWarning = true;
            });
        }
        async Task Install() {
            if (busy) return;
            if (!Environment.Is64BitOperatingSystem) { status.Text = "Bộ cài cần Windows 64-bit."; return; }
            Process[] premiere = Process.GetProcessesByName("Adobe Premiere Pro");
            bool isOpen = premiere.Length != 0;
            foreach (Process process in premiere) process.Dispose();
            if (isOpen) { status.Text = "Hãy lưu công việc và đóng Premiere rồi bấm Cài đặt."; return; }
            busy = true; gpuWarning = false; install.Enabled = false; close.Enabled = false;
            progress.Style = ProgressBarStyle.Marquee; progress.MarqueeAnimationSpeed = 30; status.Text = "Đang chuẩn bị bộ cài…";
            try {
                string data = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "AutoSyncVoice");
                string stamp = DateTime.Now.ToString("yyyyMMdd-HHmmss") + "-" + Guid.NewGuid().ToString("N").Substring(0,8);
                string folder = Path.Combine(data,"setup-cache",stamp);
                Directory.CreateDirectory(Path.Combine(data,"setup-logs"));
                logFile = Path.Combine(data,"setup-logs", stamp + ".log");
                writer = new StreamWriter(logFile, false, new UTF8Encoding(true));
                logLink.Visible = true;
                int code = await Task.Run(delegate {
                    byte[] bytes = Payload.Read(); Payload.Verify(bytes); Payload.Extract(bytes,folder);
                    Line("Auto Sync Voice Setup 0.4.0 · " + DateTime.Now.ToString("s"));
                    return Runner.Run(Path.Combine(folder,"run-setup.ps1"),Line);
                });
                // Drain pending UI log callbacks before presenting the final status.
                await Task.Yield();
                if (code != 0) throw new IOException("Cài đặt chưa hoàn tất (mã " + code + "). Xem nhật ký để biết bước bị lỗi, rồi bấm Thử lại.");
                progress.Style = ProgressBarStyle.Continuous; progress.Value = 100;
                status.Text = gpuWarning ? "Đã cài panel · GPU chưa sẵn sàng, hãy chọn CPU" : "Cài đặt hoàn tất";
                summary.Text = "Mở Premiere → Window → Extensions (Legacy) / Extensions → Auto Sync Voice. Để trống ô Python riêng trong panel.";
                install.Text = "Đã cài xong"; install.Enabled = false;
            } catch (Exception error) {
                status.Text = "Cài đặt chưa hoàn tất"; summary.Text = error.Message;
                Line(error.ToString()); ShowDetails(true); install.Text = "Thử lại"; install.Enabled = true;
                progress.Style = ProgressBarStyle.Continuous; progress.Value = 0;
            } finally {
                lock (logLock) { if (writer != null) { writer.Dispose(); writer = null; } }
                busy = false; close.Enabled = true;
            }
        }
    }

    static class Program {
        [STAThread]
        static int Main(string[] args) {
            Application.EnableVisualStyles(); Application.SetCompatibleTextRenderingDefault(false);
            if (args.Length == 2 && args[0] == "--preview") {
                using (SetupForm form = new SetupForm()) {
                    form.ShowInTaskbar = false;
                    form.StartPosition = FormStartPosition.Manual;
                    form.Location = new Point(-20000,-20000);
                    form.Show();
                    Application.DoEvents();
                    using (Bitmap bitmap = new Bitmap(form.Width, form.Height)) { form.DrawToBitmap(bitmap,new Rectangle(0,0,bitmap.Width,bitmap.Height)); bitmap.Save(args[1],System.Drawing.Imaging.ImageFormat.Png); }
                    form.Close();
                }
                return 0;
            }
            if (args.Length == 2 && args[0] == "--verify") {
                try { byte[] bytes = Payload.Read(); Payload.Verify(bytes); Payload.Extract(bytes,args[1]); return 0; }
                catch { return 1; }
            }
            if (args.Length != 0) return 2;
            bool created;
            using (Mutex mutex = new Mutex(true,@"Local\AutoSyncVoice.Setup",out created)) {
                if (!created) { MessageBox.Show("Bộ cài đang mở. Hãy quay lại cửa sổ Auto Sync Voice.","Auto Sync Voice"); return 1; }
                Application.Run(new SetupForm());
                mutex.ReleaseMutex();
            }
            return 0;
        }
    }
}
