-- ABOUTME: AppleScript application that runs PullRead on a schedule
-- ABOUTME: Uses idle handler to sync every 30 minutes while running

property syncInterval : 30 * 60 -- 30 minutes in seconds
property pullreadPath : "/Users/shellen/Documents/Claude Stuff/pullread"

on run
	syncNow()
end run

on idle
	syncNow()
	return syncInterval
end idle

on syncNow()
	try
		set timestamp to do shell script "date '+%Y-%m-%d %H:%M:%S'"
		do shell script "echo '" & timestamp & " Starting sync...' >> /tmp/pullread.log"
		do shell script "cd " & quoted form of pullreadPath & " && /usr/local/bin/npx ts-node src/index.ts sync 2>&1 >> /tmp/pullread.log"
		do shell script "echo '" & timestamp & " Sync complete' >> /tmp/pullread.log"
	on error errMsg
		do shell script "echo 'Error: " & errMsg & "' >> /tmp/pullread.log"
	end try
end syncNow

on quit
	continue quit
end quit
