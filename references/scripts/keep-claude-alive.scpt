tell application "Terminal"
	activate
	set newTab to do script "cd /Users/luissarmiento/dev/temp/trash && claude"
	delay 10
	do shell script "killall claude"
	delay 1
	close (first window whose tabs contains newTab) saving no
    quit
end tell