using System;
using System.Collections.Generic;
using System.IO;
using System.IO.Compression;
using System.Text;
using AutoSyncVoiceSetup;

class SetupTests {
    static int passed;
    static string root;
    static void Check(bool value,string message) { if (!value) throw new Exception(message); }
    static void Test(string name,Action action) { action(); passed++; Console.WriteLine("PASS: " + name); }
    static string Folder(string label) { return Path.Combine(root,label+Guid.NewGuid().ToString("N")); }
    static byte[] Zip(params string[] names) {
        using (MemoryStream bytes = new MemoryStream()) {
            using (ZipArchive zip = new ZipArchive(bytes,ZipArchiveMode.Create,true)) {
                foreach (string name in names) using (StreamWriter writer = new StreamWriter(zip.CreateEntry(name).Open())) { writer.Write("test"); }
            }
            return bytes.ToArray();
        }
    }
    static void Rejected(Action action) {
        bool failed = false;
        try { action(); } catch (IOException) { failed = true; }
        Check(failed,"Expected rejection");
    }
    static string Script(string name,string content) {
        string folder = Folder("đường dẫn có dấu 日本 "); Directory.CreateDirectory(folder);
        string script = Path.Combine(folder,name);
        File.WriteAllText(script,"[Console]::OutputEncoding = [Text.UTF8Encoding]::new($false)\r\n"+content,new UTF8Encoding(true));
        return script;
    }
    static int Main(string[] args) {
        root = Path.GetFullPath(args[0]); Directory.CreateDirectory(root);
        Test("Embedded payload hash and extraction",delegate {
            byte[] bytes = Payload.Read(); Payload.Verify(bytes); string folder = Folder("extract"); Payload.Extract(bytes,folder);
            Check(File.Exists(Path.Combine(folder,"install.ps1")),"Missing installer");
            Check(File.Exists(Path.Combine(folder,@"cep\backend\worker.py")),"Missing backend");
            Check(File.Exists(Path.Combine(folder,"run-setup.ps1")),"Missing launcher");
        });
        Test("Corrupt payload rejected",delegate { byte[] bytes = Payload.Read(); bytes[20] ^= 1; Rejected(delegate { Payload.Verify(bytes); }); });
        Test("Parent traversal rejected before extraction",delegate {
            string folder = Folder("traversal"); Rejected(delegate { Payload.Extract(Zip("normal.txt","../escape.txt"),folder); });
            Check(!File.Exists(Path.Combine(folder,"normal.txt")),"Partial extraction before validation");
            Check(!File.Exists(Path.Combine(root,"escape.txt")),"Path escaped destination");
        });
        Test("Absolute and alternate-stream paths rejected",delegate {
            foreach (string path in new[]{"C:/outside.txt","/outside.txt","file:stream"}) Rejected(delegate { Payload.Extract(Zip(path),Folder("absolute")); });
        });
        Test("Duplicate entries rejected",delegate { Rejected(delegate { Payload.Extract(Zip("same.txt","SAME.TXT"),Folder("duplicates")); }); });
        Test("Existing files are not overwritten",delegate {
            string folder = Folder("existing"); Directory.CreateDirectory(folder); File.WriteAllText(Path.Combine(folder,"keep.txt"),"original");
            Rejected(delegate { Payload.Extract(Zip("keep.txt"),folder); }); Check(File.ReadAllText(Path.Combine(folder,"keep.txt"))=="original","File overwritten");
        });
        Test("Real PowerShell child preserves Unicode and successful exit",delegate {
            List<string> lines = new List<string>(); object gate = new object();
            int code = Runner.Run(Script("success.ps1","Write-Output 'Tiếng Việt 日本'; Write-Output '[4/4] OK'; exit 0"),delegate(string line) { lock(gate) lines.Add(line); });
            Check(code==0,"Wrong exit code"); Check(lines.Contains("Tiếng Việt 日本"),"Unicode output lost"); Check(lines.Contains("[4/4] OK"),"Output not drained");
        });
        Test("Failure status and stderr returned without false success",delegate {
            List<string> lines = new List<string>(); object gate = new object();
            int code = Runner.Run(Script("failure.ps1","[Console]::Error.WriteLine('simulated failure'); exit 7"),delegate(string line) { lock(gate) lines.Add(line); });
            Check(code==7,"Failure exit code lost"); Check(lines.Contains("simulated failure"),"stderr lost");
        });
        Test("Concurrent stdout and stderr do not deadlock",delegate {
            int count = 0; object gate = new object();
            int code = Runner.Run(Script("streams.ps1","1..3000 | ForEach-Object { [Console]::Out.WriteLine('out'); [Console]::Error.WriteLine('err') }; exit 0"),delegate(string line) { lock(gate) count++; });
            Check(code==0 && count==6000,"Output incomplete or deadlock");
        });
        Console.WriteLine("TOTAL: " + passed + " passed"); return 0;
    }
}
